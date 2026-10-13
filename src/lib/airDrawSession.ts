import { DEFAULTS } from "./constants";
import type { BrushType, FrameSize, Gesture, HandLandmarks, Point, ShapeKind, Stroke, Tool, Viewport } from "../types";
import { GestureStabilizer, classifyGesture } from "./gestureClassifier";
import { LM, PointSmoother, distance, palmCenter, pinchPoint, toScreen } from "./handCoordinates";
import { eraseAt, findNearestStroke, translateStroke } from "./drawingEngine";
import { StrokeHistory, cloneStroke } from "./history";

export interface BrushSettings {
  color: string;
  thickness: number;
  glow: number;
  /** Brush used for new freehand strokes and shapes. */
  brush: BrushType;
  /** 0.05..1 */
  opacity: number;
  /** Eraser radius in CSS px (eraser tool and open-palm gesture). */
  eraserSize: number;
}

export interface FrameInput {
  /** Landmarks of the first detected hand, or null when no hand is visible. */
  landmarks: HandLandmarks | null;
  /** Detection confidence (handedness score) when available. */
  confidence?: number;
  viewport: Viewport;
  frame?: FrameSize | null;
  /** Timestamp in ms (performance.now / Date.now). */
  now: number;
}

export interface FrameOutput {
  gesture: Gesture;
  changed: boolean;
  previous: Gesture;
  /** Index fingertip in screen space while drawing. */
  cursor: Point | null;
  /** Index fingertip whenever a hand is visible (for the optional pointer). */
  fingertip: Point | null;
  /** Point added to the active stroke this frame (for particles). */
  addedPoint: Point | null;
  eraser: Point | null;
  eraserRadius: number;
  erasedSomething: boolean;
  grabPoint: Point | null;
  grabTarget: Stroke | null;
  /** True when a grab that held a stroke was released this frame. */
  dropped: boolean;
  /** True when strokes changed and the drawing layer must be re-rendered. */
  dirty: boolean;
}

/** Ignore fingertip motion right after entering draw mode (avoids transition streaks). */
export const DRAW_SETTLE_MS = 300;
/** Skip points closer than this to the previous one (keeps stroke arrays compact). */
const MIN_POINT_SPACING = 0.75;
/** Shapes shorter than this are treated as accidental taps and discarded. */
const MIN_SHAPE_SIZE = 3;

const SHAPES: readonly ShapeKind[] = ["line", "rect", "circle", "arrow"];
export const isShapeTool = (t: Tool): t is ShapeKind => (SHAPES as readonly string[]).includes(t);

/** Maps the 0..100 "smoothing" setting to the pointer smoother factor (50 → 0.35, the original). */
export function smoothingToFactor(smoothing: number): number {
  const s = Math.min(100, Math.max(0, smoothing));
  return Math.round((0.6 - (s / 100) * 0.5) * 1000) / 1000;
}

/**
 * Owns stroke data and turns per-frame hand landmarks — and mouse/touch
 * pointer input — into drawing operations with undo/redo history.
 * Pure TypeScript: no DOM or canvas access, so it is fully unit-testable.
 *
 * Invariant: `strokes` is replaced, never mutated in place, except while a
 * grabbed stroke is being moved (it is cloned into history first). This lets
 * history snapshots share unchanged stroke objects.
 */
export class AirDrawSession {
  strokes: Stroke[] = [];
  currentStroke: Stroke | null = null;
  brush: BrushSettings = {
    color: DEFAULTS.color,
    thickness: DEFAULTS.thickness,
    glow: DEFAULTS.glow,
    brush: DEFAULTS.brush,
    opacity: DEFAULTS.opacity,
    eraserSize: DEFAULTS.eraserSize,
  };
  tool: Tool = "brush";
  /** While false (onboarding modal open), gestures are tracked but don't draw. */
  active = false;
  /** Called whenever strokes or history change (drives undo/redo button state). */
  onChange: (() => void) | null = null;
  /** Increments on every change to committed strokes (incl. in-place moves); lets the renderer cache. */
  version = 0;

  readonly history = new StrokeHistory(100);
  readonly stabilizer = new GestureStabilizer("idle");
  readonly smoother = new PointSmoother(0.35);
  private gestureStart = 0;
  private pointerActive = false;
  /** Whether the current continuous erase pass has already been recorded in history. */
  private eraseRecorded = false;
  /** Previous eraser position in the current pass (for gap-free sweeping). */
  private lastErase: Point | null = null;

  private grab: { start: Point; offset: Point; index: number; paused: boolean } | null = null;

  get gesture(): Gesture {
    return this.stabilizer.current;
  }

  get canUndo(): boolean {
    return this.history.canUndo || (this.currentStroke?.points.length ?? 0) > 1;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  update(input: FrameInput): FrameOutput {
    const out: FrameOutput = {
      gesture: this.gesture,
      changed: false,
      previous: this.gesture,
      cursor: null,
      fingertip: null,
      addedPoint: null,
      eraser: null,
      eraserRadius: this.brush.eraserSize,
      erasedSomething: false,
      grabPoint: null,
      grabTarget: null,
      dropped: false,
      dirty: false,
    };

    const raw = classifyGesture(input.landmarks, {
      current: this.gesture,
      confidence: input.confidence,
    });
    const { gesture, changed, previous } = this.stabilizer.push(raw);
    out.gesture = gesture;
    out.changed = changed;
    out.previous = previous;

    if (changed) {
      this.gestureStart = input.now;
      this.eraseRecorded = false;
      this.lastErase = null;
      if (previous === "index_finger" && !this.pointerActive) out.dirty = this.endStroke() || out.dirty;
      if (previous === "pinch") {
        out.dropped = this.endGrab();
        out.dirty = true;
      }
    }

    const lm = input.landmarks;
    if (!lm || gesture === "none") {
      if (!this.pointerActive) out.dirty = this.endStroke() || out.dirty;
      return out;
    }

    out.fingertip = toScreen(lm[LM.INDEX_TIP], input.viewport, input.frame);
    if (gesture === "index_finger") out.cursor = out.fingertip;

    // Mouse/touch input owns the canvas while a pointer stroke is in progress.
    if (!this.active || this.pointerActive) return out;

    // While the stabiliser is still holding the previous gesture but the raw
    // pose has already changed (the 3-4 transition frames), don't act on it:
    // otherwise curling a finger drags a tail onto the stroke, or releasing a
    // pinch keeps moving the grabbed stroke toward the next pose.
    const confirmed = raw === gesture;

    switch (gesture) {
      case "index_finger":
        if (!confirmed) break;
        if (this.tool === "eraser") {
          out.eraser = out.cursor;
          out.cursor = null;
          if (input.now - this.gestureStart >= DRAW_SETTLE_MS && this.eraseAtPoint(out.eraser!)) {
            out.erasedSomething = true;
            out.dirty = true;
          }
        } else {
          out.addedPoint = this.draw(out.cursor!, input.now);
          out.dirty = out.dirty || out.addedPoint !== null;
        }
        break;
      case "open_palm": {
        const c = palmCenter(lm, input.viewport, input.frame);
        out.eraser = c;
        if (confirmed && this.eraseAtPoint(c)) {
          out.erasedSomething = true;
          out.dirty = true;
        }
        break;
      }
      case "pinch": {
        const p = pinchPoint(lm, input.viewport, input.frame);
        out.grabPoint = p;
        out.grabTarget = this.moveGrab(p, confirmed);
        out.dirty = out.dirty || out.grabTarget !== null;
        break;
      }
      default:
        break;
    }

    // Any non-drawing gesture ends the current stroke so resuming never
    // connects to old points with a stray line.
    if (gesture !== "index_finger") out.dirty = this.endStroke() || out.dirty;
    return out;
  }

  // ---------------------------------------------------------- hand drawing --

  private draw(tip: Point, now: number): Point | null {
    if (now - this.gestureStart < DRAW_SETTLE_MS) {
      this.smoother.reset(tip);
      return null;
    }
    if (!this.currentStroke) {
      this.smoother.reset(tip);
      this.begin(tip);
      return { ...tip };
    }
    return this.extend(this.smoother.next(tip));
  }

  /** Starts a new freehand stroke or shape at `p` with the current brush settings. */
  private begin(p: Point): void {
    const shape = isShapeTool(this.tool) ? this.tool : undefined;
    this.currentStroke = {
      points: shape ? [{ ...p }, { ...p }] : [{ ...p }],
      color: this.brush.color,
      thickness: this.brush.thickness,
      glow: this.brush.glow,
      brush: this.brush.brush,
      opacity: this.brush.opacity,
      ...(shape ? { shape } : {}),
    };
  }

  /** Adds a freehand point, or moves a shape's end point. Returns the point when something changed. */
  private extend(p: Point): Point | null {
    const s = this.currentStroke;
    if (!s) return null;
    if (s.shape) {
      s.points[1] = { ...p };
      return p;
    }
    const pts = s.points;
    if (distance(pts[pts.length - 1], p) < MIN_POINT_SPACING) return null;
    pts.push(p);
    return p;
  }

  /** Commits the active stroke/shape if it is non-trivial. Returns true if anything changed. */
  endStroke(): boolean {
    if (!this.currentStroke) return false;
    const s = this.currentStroke;
    this.currentStroke = null;
    const keep = s.shape ? distance(s.points[0], s.points[1]) >= MIN_SHAPE_SIZE : s.points.length > 1;
    if (keep) this.commit([...this.strokes, s]);
    return true;
  }

  // -------------------------------------------------------- mouse / touch --

  /** Starts drawing, erasing or a shape at `p` (CSS px). Ignored until the studio is active. */
  pointerDown(p: Point): boolean {
    if (!this.active) return false;
    this.endStroke(); // never let a hand stroke and a pointer stroke merge
    this.pointerActive = true;
    this.eraseRecorded = false;
    this.lastErase = null;
    if (this.tool === "eraser") this.eraseAtPoint(p);
    else this.begin(p);
    return true;
  }

  pointerMove(p: Point): boolean {
    if (!this.pointerActive) return false;
    if (this.tool === "eraser") return this.eraseAtPoint(p);
    return this.extend(p) !== null;
  }

  pointerUp(): void {
    if (!this.pointerActive) return;
    this.pointerActive = false;
    this.lastErase = null;
    const s = this.currentStroke;
    // A click without movement leaves a dot.
    if (s && !s.shape && s.points.length === 1) s.points.push({ x: s.points[0].x + 0.01, y: s.points[0].y });
    this.endStroke();
  }

  get isPointerDrawing(): boolean {
    return this.pointerActive;
  }

  // ------------------------------------------------------------ erasing --

  /**
   * Erases around `p` with the current eraser size, sweeping continuously from
   * the previous erase point of the same pass so fast movements leave no gaps.
   * One history entry per continuous pass.
   */
  eraseAtPoint(p: Point): boolean {
    const r = this.brush.eraserSize;
    const from = this.lastErase;
    this.lastErase = { ...p };
    const stamps: Point[] = [];
    if (from) {
      const n = Math.min(200, Math.ceil(distance(from, p) / Math.max(2, r * 0.5)));
      for (let k = 1; k <= n; k++) stamps.push({ x: from.x + ((p.x - from.x) * k) / n, y: from.y + ((p.y - from.y) * k) / n });
    } else {
      stamps.push(p);
    }
    let strokes = this.strokes;
    let erased = false;
    for (const c of stamps) {
      const res = eraseAt(strokes, c, r);
      if (res.erased) {
        strokes = res.strokes;
        erased = true;
      }
    }
    if (!erased) return false;
    if (!this.eraseRecorded) {
      this.history.record(this.strokes);
      this.eraseRecorded = true;
    }
    this.strokes = strokes;
    this.notify();
    return true;
  }

  // ------------------------------------------------------------- moving --

  private moveGrab(p: Point, confirmed = true): Stroke | null {
    if (!this.grab) {
      const index = findNearestStroke(this.strokes, p);
      if (index >= 0) {
        // Move a private copy so that no history snapshot (which may share the
        // original stroke object) is ever mutated.
        this.history.record(this.strokes);
        this.strokes = this.strokes.map((s, i) => (i === index ? cloneStroke(s) : s));
        this.notify();
      }
      this.grab = { start: { ...p }, offset: { x: 0, y: 0 }, index, paused: false };
    } else if (!confirmed) {
      // Hold the stroke still while the pose is ambiguous.
      this.grab.paused = true;
    } else if (this.grab.paused) {
      // Resume from the current hand position without a jump.
      this.grab.start = { x: p.x - this.grab.offset.x, y: p.y - this.grab.offset.y };
      this.grab.paused = false;
    } else {
      const dx = p.x - this.grab.start.x;
      const dy = p.y - this.grab.start.y;
      const target = this.strokes[this.grab.index];
      if (target) {
        translateStroke(target, dx - this.grab.offset.x, dy - this.grab.offset.y);
        this.version++;
      }
      this.grab.offset = { x: dx, y: dy };
    }
    return this.strokes[this.grab.index] ?? null;
  }

  /** Releases a grab. Returns true if a stroke was being held. */
  endGrab(): boolean {
    const held = !!this.grab && this.grab.index >= 0;
    this.grab = null;
    return held;
  }

  // ------------------------------------------------------------ history --

  private commit(next: Stroke[]): void {
    this.history.record(this.strokes);
    this.strokes = next;
    this.notify();
  }

  private notify(): void {
    this.version++;
    this.onChange?.();
  }

  undo(): boolean {
    this.endStroke();
    this.endGrab();
    const prev = this.history.undo(this.strokes);
    if (!prev) return false;
    this.strokes = prev;
    this.notify();
    return true;
  }

  redo(): boolean {
    this.endStroke();
    this.endGrab();
    const next = this.history.redo(this.strokes);
    if (!next) return false;
    this.strokes = next;
    this.notify();
    return true;
  }

  /** Clears the drawing as one undoable operation. Returns false if already empty. */
  clear(): boolean {
    this.currentStroke = null;
    this.grab = null;
    if (this.strokes.length === 0) return false;
    this.commit([]);
    return true;
  }

  /** Replaces the drawing (restore / import) as one undoable operation. */
  replaceStrokes(strokes: Stroke[]): void {
    this.currentStroke = null;
    this.grab = null;
    this.commit(strokes.map(cloneStroke));
  }

  /** Appends a finished stroke as one undoable operation. */
  addStroke(stroke: Stroke): void {
    this.commit([...this.strokes, stroke]);
  }

  setTool(tool: Tool): void {
    if (tool !== this.tool) this.endStroke();
    this.tool = tool;
  }

  setSmoothing(smoothing: number): void {
    this.smoother.factor = smoothingToFactor(smoothing);
  }

  /** Called when the onboarding modal is dismissed. */
  start(): void {
    this.active = true;
  }
}

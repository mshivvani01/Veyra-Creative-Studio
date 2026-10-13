import type { BrushType, HandLandmarks, Point, ShapeKind, Stroke, Viewport, FrameSize } from "../types";
import { FINGERTIPS, HAND_CONNECTIONS, distance, toScreen } from "./handCoordinates";

export const ERASER_RADIUS = 28;
export const GRAB_RADIUS = 80;
/** Veyra ivory: used as the background of exported PNGs. */
export const BACKGROUND = "#f7f3ee";

/** Overlay colours for the light Veyra theme (hand skeleton, tool cursors). */
export const OVERLAY = {
  bone: "rgba(48, 34, 63, 0.32)",
  joint: "rgba(48, 34, 63, 0.45)",
  tip: "#8b63d6",
  tipGlow: "rgba(139, 99, 214, 0.55)",
  eraser: "rgba(184, 67, 77, 0.75)",
  eraserFill: "rgba(201, 79, 88, 0.08)",
  grab: "rgba(139, 99, 214, 0.85)",
  grabFill: "rgba(199, 167, 247, 0.18)",
  grabTrail: "rgba(139, 99, 214, 0.32)",
  pointer: "#30223f",
} as const;

export type OverlayPalette = { [K in keyof typeof OVERLAY]: string };


/** Brush used for strokes that don't specify one (pre-2.0 drawings were all neon). */
export const LEGACY_BRUSH: BrushType = "neon";

/** Minimal 2D context surface used by the renderer (keeps it unit-testable). */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "quadraticCurveTo"
  | "arc"
  | "stroke"
  | "fill"
  | "setLineDash"
  | "clearRect"
> & {
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
};

// ---------------------------------------------------------------- strokes --

/**
 * Removes every stroke point within `radius` of `center`, splitting strokes
 * into separate pieces where the eraser cuts through them. Pieces with fewer
 * than 2 points are discarded. Untouched strokes are kept by reference.
 */
export function eraseAt(
  strokes: readonly Stroke[],
  center: Point,
  radius = ERASER_RADIUS,
): { strokes: Stroke[]; erased: boolean } {
  let erased = false;
  const out: Stroke[] = [];
  for (const stroke of strokes) {
    // Shapes are removed whole when the eraser touches their outline.
    if (stroke.shape) {
      if (outlineSamples(stroke).some((p) => distance(p, center) < radius)) erased = true;
      else out.push(stroke);
      continue;
    }
    const pieces: Point[][] = [];
    let run: Point[] = [];
    let touched = false;
    for (const p of stroke.points) {
      if (distance(p, center) >= radius) {
        run.push(p);
      } else {
        touched = true;
        if (run.length >= 2) pieces.push(run);
        run = [];
      }
    }
    if (run.length >= 2) pieces.push(run);
    if (!touched) {
      out.push(stroke);
      continue;
    }
    erased = true;
    for (const points of pieces) out.push({ ...stroke, points });
  }
  return { strokes: out, erased };
}

/** Index of the stroke with a point closest to `p`, or -1 if none within maxDist. */
export function findNearestStroke(strokes: readonly Stroke[], p: Point, maxDist = GRAB_RADIUS): number {
  let best = Infinity;
  let idx = -1;
  strokes.forEach((s, i) => {
    for (const q of s.shape ? outlineSamples(s) : s.points) {
      const d = distance(q, p);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
  });
  return best < maxDist ? idx : -1;
}

/** Translates a stroke in place. */
export function translateStroke(stroke: Stroke, dx: number, dy: number): void {
  for (const p of stroke.points) {
    p.x += dx;
    p.y += dy;
  }
}

// ------------------------------------------------------------------ shapes --

/**
 * Outline of a shape as polylines (in CSS px). Freehand strokes return their
 * points as a single polyline.
 *  - line:   start -> end
 *  - rect:   axis-aligned rectangle spanning the start/end corners
 *  - circle: centred on start, radius = |end - start|
 *  - arrow:  shaft start -> end plus a two-sided head at end
 */
export function shapeOutline(stroke: Stroke): Point[][] {
  const kind = stroke.shape;
  if (!kind || stroke.points.length < 2) return [stroke.points];
  return outlineFor(kind, stroke.points[0], stroke.points[stroke.points.length - 1], stroke.thickness);
}

export function outlineFor(kind: ShapeKind, a: Point, b: Point, thickness: number): Point[][] {
  switch (kind) {
    case "line":
      return [[a, b]];
    case "rect":
      return [[a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]];
    case "circle": {
      const r = distance(a, b);
      const n = Math.max(24, Math.min(96, Math.round(r / 3)));
      const ring: Point[] = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        ring.push({ x: a.x + Math.cos(t) * r, y: a.y + Math.sin(t) * r });
      }
      return [ring];
    }
    case "arrow": {
      const len = distance(a, b);
      if (len < 1e-6) return [[a, b]];
      const head = Math.min(len * 0.45, Math.max(14, thickness * 3.2));
      const ux = (a.x - b.x) / len;
      const uy = (a.y - b.y) / len;
      const wing = (angle: number): Point => ({
        x: b.x + (ux * Math.cos(angle) - uy * Math.sin(angle)) * head,
        y: b.y + (ux * Math.sin(angle) + uy * Math.cos(angle)) * head,
      });
      return [[a, b], [wing(0.5), b, wing(-0.5)]];
    }
  }
}

/** Outline points densified to <= `step` px apart (for hit-testing shapes). */
export function outlineSamples(stroke: Stroke, step = 3): Point[] {
  const out: Point[] = [];
  for (const line of shapeOutline(stroke)) out.push(...densify(line, step));
  return out;
}

function densify(line: readonly Point[], step: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < line.length; i++) {
    if (i > 0) {
      const q = line[i - 1];
      const p = line[i];
      const n = Math.max(1, Math.ceil(distance(p, q) / step));
      for (let k = 1; k < n; k++) out.push({ x: q.x + ((p.x - q.x) * k) / n, y: q.y + ((p.y - q.y) * k) / n });
    }
    out.push(line[i]);
  }
  return out;
}

/** Mixes a #rrggbb colour toward white by `amount` (0..1). Returns rgb(). */
export function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// -------------------------------------------------------------- rendering --

/** Traces a smoothed path through the points using quadratic midpoints. */
export function tracePath(ctx: Ctx2D, pts: readonly Point[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** Traces straight polylines (shapes) as subpaths of one path. */
function tracePolylines(ctx: Ctx2D, lines: readonly (readonly Point[])[]): void {
  ctx.beginPath();
  for (const line of lines) {
    if (line.length === 0) continue;
    ctx.moveTo(line[0].x, line[0].y);
    for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
  }
}

/** Traces a stroke's geometry: smoothed curve for freehand, straight outline for shapes. */
function traceStroke(ctx: Ctx2D, stroke: Stroke, jitter?: (p: Point, i: number) => Point): void {
  if (stroke.shape) {
    const lines = shapeOutline(stroke);
    tracePolylines(ctx, jitter ? lines.map((l) => densify(l, 6).map(jitter)) : lines);
  } else {
    tracePath(ctx, jitter ? stroke.points.map(jitter) : stroke.points);
  }
}

/** Deterministic noise in [-1, 1], so pencil grain is stable across re-renders. */
export function grain(i: number, pass: number): number {
  const v = Math.sin(i * 12.9898 + pass * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/** Per-brush width multiplier and base alpha (also used by the brush preview). */
export const BRUSH_STYLE: Record<BrushType, { widthScale: number; alpha: number }> = {
  pen: { widthScale: 1, alpha: 1 },
  marker: { widthScale: 1.6, alpha: 0.72 },
  pencil: { widthScale: 0.55, alpha: 0.85 },
  highlighter: { widthScale: 2.6, alpha: 0.35 },
  neon: { widthScale: 1, alpha: 1 },
};

/**
 * Renders a stroke with its brush:
 *  - pen:         one clean solid pass
 *  - marker:      wider and translucent, with a faint soft edge
 *  - pencil:      thin graphite core plus two jittered grain passes
 *  - highlighter: very wide, flat-capped, highly translucent
 *  - neon:        wide faint halo + mid glow + solid core, scaled by `glow`
 * Opacity multiplies every pass. `coreLighten` (neon only) mixes the core
 * toward white; the original dark theme used 0.5, Veyra's light canvas 0.
 */
export function renderStroke(ctx: Ctx2D, stroke: Stroke, coreLighten = 0): void {
  if (stroke.points.length < 2) return;
  const brush = stroke.brush ?? LEGACY_BRUSH;
  const opacity = stroke.opacity ?? 1;
  const t = stroke.thickness;
  const style = BRUSH_STYLE[brush];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.shadowColor = stroke.color;
  ctx.shadowBlur = 0;

  switch (brush) {
    case "pen":
      traceStroke(ctx, stroke);
      ctx.lineWidth = t;
      ctx.globalAlpha = opacity;
      ctx.stroke();
      break;
    case "marker":
      // Faint, slightly wider edge pass + translucent body: ~72% in the centre.
      traceStroke(ctx, stroke);
      ctx.lineWidth = t * style.widthScale + Math.max(2, t * 0.3);
      ctx.globalAlpha = opacity * 0.18;
      ctx.stroke();
      traceStroke(ctx, stroke);
      ctx.lineWidth = t * style.widthScale;
      ctx.globalAlpha = opacity * 0.66;
      ctx.stroke();
      break;
    case "highlighter":
      traceStroke(ctx, stroke);
      ctx.lineCap = "butt";
      ctx.lineWidth = t * style.widthScale;
      ctx.globalAlpha = opacity * style.alpha;
      ctx.stroke();
      break;
    case "pencil": {
      traceStroke(ctx, stroke);
      ctx.lineWidth = Math.max(1, t * style.widthScale);
      ctx.globalAlpha = opacity * style.alpha;
      ctx.stroke();
      const amp = Math.max(0.6, t * 0.32);
      for (const pass of [1, 2]) {
        traceStroke(ctx, stroke, (p, i) => ({ x: p.x + grain(i, pass) * amp, y: p.y + grain(i + 7, pass) * amp }));
        ctx.lineWidth = Math.max(0.6, t * 0.22);
        ctx.globalAlpha = opacity * 0.38;
        ctx.stroke();
      }
      break;
    }
    case "neon": {
      const glow = stroke.glow / 100;
      if (glow > 0) {
        traceStroke(ctx, stroke);
        ctx.lineWidth = t * 3;
        ctx.globalAlpha = 0.1 * glow * opacity;
        ctx.shadowBlur = 35 * glow;
        ctx.stroke();

        traceStroke(ctx, stroke);
        ctx.lineWidth = t * 1.6;
        ctx.globalAlpha = 0.35 * glow * opacity;
        ctx.shadowBlur = 15 * glow;
        ctx.stroke();
      }
      traceStroke(ctx, stroke);
      ctx.strokeStyle = coreLighten > 0 ? lightenColor(stroke.color, coreLighten) : stroke.color;
      ctx.lineWidth = t;
      ctx.globalAlpha = opacity;
      ctx.shadowBlur = 6 * glow;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export function renderDrawing(
  ctx: Ctx2D,
  viewport: Viewport,
  strokes: readonly Stroke[],
  current: Stroke | null,
): void {
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  for (const s of strokes) renderStroke(ctx, s);
  if (current && current.points.length > 1) renderStroke(ctx, current);
}

// ---------------------------------------------------------------- overlay --

export function drawHandSkeleton(
  ctx: Ctx2D,
  lm: HandLandmarks,
  viewport: Viewport,
  frame?: FrameSize | null,
  palette: OverlayPalette = OVERLAY,
): void {
  const pts = lm.map((l) => toScreen(l, viewport, frame));
  ctx.save();
  // Overlay colours carry their own alpha (tuned per background).
  ctx.strokeStyle = palette.bone;
  ctx.lineWidth = 1.5;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  }
  ctx.fillStyle = palette.joint;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const i of FINGERTIPS) {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 5, 0, Math.PI * 2);
    ctx.fillStyle = palette.tip;
    ctx.shadowColor = palette.tipGlow;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/** Brush cursor shown at the index fingertip while drawing. */
export function drawBrushCursor(ctx: Ctx2D, p: Point, color: string, thickness: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, thickness / 2 + 6, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.restore();
}

/** Optional fingertip pointer (overlay only, never painted into the drawing). */
export function drawPointer(ctx: Ctx2D, p: Point, palette: OverlayPalette = OVERLAY): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
  ctx.strokeStyle = palette.pointer;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
  ctx.fillStyle = palette.pointer;
  ctx.fill();
  ctx.restore();
}

export function drawEraserRing(ctx: Ctx2D, c: Point, radius = ERASER_RADIUS, palette: OverlayPalette = OVERLAY): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = palette.eraser;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = palette.eraserFill;
  ctx.fill();
  ctx.restore();
}

export function drawGrabIndicator(
  ctx: Ctx2D,
  p: Point,
  target: Stroke | null,
  palette: OverlayPalette = OVERLAY,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
  ctx.strokeStyle = palette.grab;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = palette.grabFill;
  ctx.fill();
  if (target && target.points.length >= 2) {
    tracePolylines(ctx, shapeOutline(target));
    ctx.strokeStyle = palette.grabTrail;
    ctx.lineWidth = target.thickness + 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// -------------------------------------------------------------- particles --

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color: string;
}

export function spawnParticles(list: Particle[], p: Point, color: string, rand = Math.random): void {
  for (let i = 0; i < 2; i++) {
    list.push({
      x: p.x,
      y: p.y,
      vx: (rand() - 0.5) * 3,
      vy: (rand() - 0.5) * 3,
      life: 1,
      decay: 0.02 + rand() * 0.03,
      size: 2 + rand() * 3,
      color,
    });
  }
}

/** Advances and draws particles; dead particles are removed in place. */
export function stepParticles(ctx: Ctx2D, list: Particle[]): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i];
    q.x += q.vx;
    q.y += q.vy;
    q.life -= q.decay;
    q.size *= 0.97;
    if (q.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = q.life * 0.7;
    ctx.fillStyle = q.color;
    ctx.shadowColor = q.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

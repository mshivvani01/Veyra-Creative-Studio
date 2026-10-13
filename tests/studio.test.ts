import { describe, expect, it } from "vitest";
import { AirDrawSession, DRAW_SETTLE_MS, smoothingToFactor } from "../src/lib/airDrawSession";
import { BRUSH_STYLE, eraseAt, findNearestStroke, outlineFor, renderStroke, shapeOutline, type Ctx2D } from "../src/lib/drawingEngine";
import type { Landmark, Stroke } from "../src/types";
import { POSES, pointAt } from "./fixtures/hands";

// ------------------------------------------------------------------ helpers --

function recorder() {
  const passes: Array<{ lineWidth: number; alpha: number; cap: string; blur: number; segments: number }> = [];
  let segments = 0;
  const ctx = {
    lineCap: "round",
    lineJoin: "round",
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    save() {},
    restore() {},
    beginPath() {
      segments = 0;
    },
    moveTo() {},
    lineTo() {
      segments++;
    },
    quadraticCurveTo() {
      segments++;
    },
    arc() {},
    fill() {},
    setLineDash() {},
    clearRect() {},
    stroke() {
      passes.push({ lineWidth: ctx.lineWidth, alpha: ctx.globalAlpha, cap: ctx.lineCap, blur: ctx.shadowBlur, segments });
    },
  };
  return { ctx: ctx as unknown as Ctx2D, passes };
}

const line = (extra: Partial<Stroke> = {}): Stroke => ({
  points: Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 50 })),
  color: "#e0654d",
  thickness: 10,
  glow: 60,
  ...extra,
});

// ------------------------------------------------------------------ brushes --

describe("brush presets render distinctly", () => {
  const render = (brush: Stroke["brush"], opacity = 1) => {
    const r = recorder();
    renderStroke(r.ctx, line({ brush, opacity }));
    return r.passes;
  };

  it("pen: one clean solid pass at full width", () => {
    expect(render("pen")).toEqual([expect.objectContaining({ lineWidth: 10, alpha: 1, blur: 0, cap: "round" })]);
  });

  it("marker: wider, translucent body with a faint soft edge", () => {
    const [edge, body] = render("marker");
    expect(body.lineWidth).toBe(10 * BRUSH_STYLE.marker.widthScale);
    expect(edge.lineWidth).toBeGreaterThan(body.lineWidth);
    expect(edge.alpha).toBeCloseTo(0.18);
    expect(body.alpha).toBeCloseTo(0.66);
    // Combined centre coverage ≈ 72%: clearly translucent.
    expect(1 - (1 - edge.alpha) * (1 - body.alpha)).toBeCloseTo(BRUSH_STYLE.marker.alpha, 2);
  });

  it("pencil: thin core plus two jittered grain passes", () => {
    const passes = render("pencil");
    expect(passes).toHaveLength(3);
    expect(passes[0].lineWidth).toBeCloseTo(5.5);
    expect(passes[1].lineWidth).toBeLessThan(passes[0].lineWidth);
  });

  it("highlighter: very wide, flat caps, highly translucent", () => {
    const [p] = render("highlighter");
    expect(p.lineWidth).toBe(26);
    expect(p.cap).toBe("butt");
    expect(p.alpha).toBeCloseTo(0.35);
  });

  it("neon: halo + glow + core", () => {
    expect(render("neon").map((p) => p.lineWidth)).toEqual([30, 16, 10]);
  });

  it("opacity multiplies every pass of every brush", () => {
    for (const b of ["pen", "marker", "pencil", "highlighter", "neon"] as const) {
      const full = render(b, 1);
      const half = render(b, 0.5);
      half.forEach((p, i) => expect(p.alpha).toBeCloseTo(full[i].alpha * 0.5));
    }
  });

  it("pencil grain is deterministic (stable when re-rendered)", () => {
    const a = render("pencil");
    const b = render("pencil");
    expect(a).toEqual(b);
  });
});

// ------------------------------------------------------------------- shapes --

describe("shape geometry", () => {
  const a = { x: 100, y: 100 };
  const b = { x: 200, y: 160 };

  it("line, rectangle, circle and arrow outlines", () => {
    expect(outlineFor("line", a, b, 4)).toEqual([[a, b]]);
    expect(outlineFor("rect", a, b, 4)[0]).toEqual([a, { x: 200, y: 100 }, b, { x: 100, y: 160 }, a]);
    const ring = outlineFor("circle", a, { x: 150, y: 100 }, 4)[0];
    for (const p of ring) expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(50, 5);
    const arrow = outlineFor("arrow", a, b, 4);
    expect(arrow).toHaveLength(2);
    expect(arrow[1][1]).toEqual(b); // head meets at the tip
  });

  it("shapes render as straight outlines and are erased whole when touched", () => {
    const rect: Stroke = { points: [a, b], color: "#000000", thickness: 4, glow: 0, brush: "pen", shape: "rect" };
    const r = recorder();
    renderStroke(r.ctx, rect);
    expect(r.passes[0].segments).toBe(4);
    expect(eraseAt([rect], { x: 300, y: 300 }, 20).erased).toBe(false);
    const hit = eraseAt([rect], { x: 150, y: 100 }, 10);
    expect(hit.erased).toBe(true);
    expect(hit.strokes).toHaveLength(0);
  });

  it("grabbing finds a shape by its outline, not just its two control points", () => {
    const circle: Stroke = { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], color: "#000000", thickness: 4, glow: 0, shape: "circle" };
    expect(findNearestStroke([circle], { x: 0, y: 205 })).toBe(0);
    expect(shapeOutline(circle)[0].length).toBeGreaterThan(24);
  });
});

// ------------------------------------------------------------------ session --

const viewport = { width: 1000, height: 1000 };
function hand(s: AirDrawSession) {
  let now = 0;
  return {
    hold(lm: Landmark[] | null, n: number) {
      for (let i = 0; i < n; i++) {
        now += 33;
        s.update({ landmarks: lm, viewport, now });
      }
    },
  };
}

describe("studio session: tools, history and settings", () => {
  it("draws with mouse/touch and records each stroke as one undoable operation", () => {
    const s = new AirDrawSession();
    s.start();
    s.pointerDown({ x: 10, y: 10 });
    for (let i = 1; i <= 10; i++) s.pointerMove({ x: 10 + i * 10, y: 10 });
    s.pointerUp();
    s.pointerDown({ x: 10, y: 50 });
    s.pointerMove({ x: 90, y: 50 });
    s.pointerUp();
    expect(s.strokes).toHaveLength(2);
    expect(s.undo()).toBe(true);
    expect(s.strokes).toHaveLength(1);
    expect(s.redo()).toBe(true);
    expect(s.strokes).toHaveLength(2);
  });

  it("ignores pointer input until the studio is started", () => {
    const s = new AirDrawSession();
    expect(s.pointerDown({ x: 1, y: 1 })).toBe(false);
    s.pointerUp();
    expect(s.strokes).toHaveLength(0);
  });

  it("a click without movement leaves a dot", () => {
    const s = new AirDrawSession();
    s.start();
    s.pointerDown({ x: 5, y: 5 });
    s.pointerUp();
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0].points).toHaveLength(2);
  });

  it("captures brush, opacity and colour per stroke; changing them later does not alter existing strokes", () => {
    const s = new AirDrawSession();
    s.start();
    Object.assign(s.brush, { brush: "marker", opacity: 0.4, color: "#123456", thickness: 20 });
    s.pointerDown({ x: 0, y: 0 });
    s.pointerMove({ x: 50, y: 0 });
    s.pointerUp();
    Object.assign(s.brush, { brush: "pen", opacity: 1, color: "#ffffff", thickness: 2 });
    expect(s.strokes[0]).toMatchObject({ brush: "marker", opacity: 0.4, color: "#123456", thickness: 20 });
  });

  it("creates shapes by dragging; tiny accidental shapes are discarded", () => {
    const s = new AirDrawSession();
    s.start();
    s.setTool("circle");
    s.pointerDown({ x: 100, y: 100 });
    s.pointerMove({ x: 140, y: 100 });
    s.pointerMove({ x: 160, y: 100 });
    s.pointerUp();
    expect(s.strokes[0]).toMatchObject({ shape: "circle", points: [{ x: 100, y: 100 }, { x: 160, y: 100 }] });
    s.pointerDown({ x: 300, y: 300 });
    s.pointerMove({ x: 301, y: 300 });
    s.pointerUp();
    expect(s.strokes).toHaveLength(1);
  });

  it("creates shapes with the hand: the end follows the fingertip and is placed when pointing stops", () => {
    const s = new AirDrawSession();
    s.start();
    s.setTool("line");
    const h = hand(s);
    h.hold(pointAt(0.6, 0.5), 4 + Math.ceil(DRAW_SETTLE_MS / 33) + 1);
    h.hold(pointAt(0.4, 0.5), 20);
    expect(s.currentStroke?.shape).toBe("line");
    h.hold(POSES.fist, 5);
    expect(s.strokes).toHaveLength(1);
    const [a, b] = s.strokes[0].points;
    expect(b.x - a.x).toBeGreaterThan(150); // mirrored: hand moved left → line extends right
  });

  it("eraser tool erases with the mouse as one undoable operation", () => {
    const s = new AirDrawSession();
    s.start();
    s.pointerDown({ x: 0, y: 100 });
    for (let x = 10; x <= 300; x += 10) s.pointerMove({ x, y: 100 });
    s.pointerUp();
    s.setTool("eraser");
    s.brush.eraserSize = 20;
    s.pointerDown({ x: 100, y: 100 });
    s.pointerMove({ x: 150, y: 100 });
    s.pointerMove({ x: 200, y: 100 });
    s.pointerUp();
    expect(s.strokes.length).toBe(2); // split into two pieces
    expect(s.undo()).toBe(true); // a single undo restores the whole erase pass
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0].points.length).toBeGreaterThan(25);
  });

  it("eraser size controls how much is removed", () => {
    const make = (size: number) => {
      const s = new AirDrawSession();
      s.start();
      s.addStroke({ points: Array.from({ length: 101 }, (_, i) => ({ x: i * 2, y: 0 })), color: "#000000", thickness: 4, glow: 0 });
      s.brush.eraserSize = size;
      s.eraseAtPoint({ x: 100, y: 0 });
      return s.strokes.reduce((n, st) => n + st.points.length, 0);
    };
    expect(make(10)).toBeGreaterThan(make(60));
  });

  it("open-palm erase is undoable and moving a stroke is undoable without corrupting older history", () => {
    const s = new AirDrawSession();
    s.start();
    s.addStroke({ points: [{ x: 500, y: 500 }, { x: 520, y: 500 }], color: "#000000", thickness: 4, glow: 0 });
    s.addStroke({ points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], color: "#000000", thickness: 4, glow: 0 });
    const pinch = POSES.pinch;
    const gx = (1 - (pinch[4].x + pinch[8].x) / 2) * 1000;
    const gy = ((pinch[4].y + pinch[8].y) / 2) * 1000;
    // Put stroke 0 under the pinch point and move it.
    s.replaceStrokes([{ ...s.strokes[0], points: [{ x: gx, y: gy }, { x: gx + 20, y: gy }] }, s.strokes[1]]);
    const before = s.strokes[0].points[0];
    const h = hand(s);
    h.hold(pinch, 3);
    h.hold(pinch.map((p) => ({ x: p.x - 0.1, y: p.y })), 3);
    h.hold(POSES.fist, 5);
    expect(s.strokes[0].points[0].x).toBeCloseTo(before.x + 100, 3);
    expect(s.undo()).toBe(true); // undo the move
    expect(s.strokes[0].points[0]).toEqual(before);
    expect(s.undo()).toBe(true); // undo replaceStrokes
    expect(s.strokes[0].points[0]).toEqual({ x: 500, y: 500 }); // older snapshot untouched
  });

  it("clear is undoable, redo is invalidated by a new operation, and buttons can reflect state", () => {
    const s = new AirDrawSession();
    let changes = 0;
    s.onChange = () => changes++;
    s.addStroke({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#000000", thickness: 4, glow: 0 });
    expect(s.canUndo).toBe(true);
    expect(s.canRedo).toBe(false);
    s.clear();
    expect(s.strokes).toHaveLength(0);
    s.undo();
    expect(s.strokes).toHaveLength(1);
    expect(s.canRedo).toBe(true);
    s.addStroke({ points: [{ x: 5, y: 5 }, { x: 6, y: 6 }], color: "#000000", thickness: 4, glow: 0 });
    expect(s.canRedo).toBe(false);
    expect(changes).toBeGreaterThanOrEqual(4);
    expect(s.clear()).toBe(true);
    expect(s.clear()).toBe(false); // already empty: nothing recorded
  });

  it("pointer smoothing setting changes the real smoother factor", () => {
    const s = new AirDrawSession();
    expect(smoothingToFactor(50)).toBeCloseTo(0.35); // the original value
    s.setSmoothing(100);
    expect(s.smoother.factor).toBeCloseTo(0.1);
    s.setSmoothing(0);
    expect(s.smoother.factor).toBeCloseTo(0.6);
  });

  it("hand and mouse strokes never merge", () => {
    const s = new AirDrawSession();
    s.start();
    const h = hand(s);
    h.hold(pointAt(0.6, 0.3), 4 + Math.ceil(DRAW_SETTLE_MS / 33) + 1);
    h.hold(pointAt(0.5, 0.3), 5);
    expect(s.currentStroke).not.toBeNull();
    s.pointerDown({ x: 10, y: 900 }); // commits the hand stroke first
    s.pointerMove({ x: 60, y: 900 });
    s.pointerUp();
    expect(s.strokes).toHaveLength(2);
    expect(s.strokes[1].points[0]).toEqual({ x: 10, y: 900 });
  });
});

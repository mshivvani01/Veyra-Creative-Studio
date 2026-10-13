import { describe, expect, it } from "vitest";
import {
  ERASER_RADIUS,
  eraseAt,
  findNearestStroke,
  lightenColor,
  renderDrawing,
  renderStroke,
  spawnParticles,
  stepParticles,
  translateStroke,
  type Ctx2D,
  type Particle,
} from "../src/lib/drawingEngine";
import type { Stroke } from "../src/types";

function line(x0: number, x1: number, y = 100, step = 5, extra: Partial<Stroke> = {}): Stroke {
  const points = [];
  for (let x = x0; x <= x1; x += step) points.push({ x, y });
  return { points, color: "#00f0ff", thickness: 6, glow: 60, ...extra };
}

/** Records every stroke() call with the context state at that moment. */
function mockCtx() {
  const strokes: Array<{
    lineWidth: number;
    globalAlpha: number;
    shadowBlur: number;
    strokeStyle: unknown;
    lineCap: string;
    lineJoin: string;
  }> = [];
  const calls: string[] = [];
  const ctx = {
    lineCap: "butt",
    lineJoin: "miter",
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    quadraticCurveTo: () => calls.push("quad"),
    arc: () => calls.push("arc"),
    fill: () => calls.push("fill"),
    setLineDash: () => calls.push("dash"),
    clearRect: () => calls.push("clear"),
    stroke() {
      calls.push("stroke");
      strokes.push({
        lineWidth: ctx.lineWidth,
        globalAlpha: ctx.globalAlpha,
        shadowBlur: ctx.shadowBlur,
        strokeStyle: ctx.strokeStyle,
        lineCap: ctx.lineCap,
        lineJoin: ctx.lineJoin,
      });
    },
  };
  return { ctx: ctx as unknown as Ctx2D, strokes, calls };
}

describe("eraseAt", () => {
  it("splits a stroke where the eraser passes through it", () => {
    const s = line(0, 200);
    const { strokes, erased } = eraseAt([s], { x: 100, y: 100 });
    expect(erased).toBe(true);
    expect(strokes).toHaveLength(2);
    for (const piece of strokes) {
      expect(piece.color).toBe(s.color);
      for (const p of piece.points) expect(Math.hypot(p.x - 100, p.y - 100)).toBeGreaterThanOrEqual(ERASER_RADIUS);
    }
  });

  it("keeps untouched strokes by reference", () => {
    const s = line(0, 50, 400);
    const res = eraseAt([s], { x: 100, y: 100 });
    expect(res.erased).toBe(false);
    expect(res.strokes[0]).toBe(s);
  });

  it("removes strokes entirely covered by the eraser", () => {
    const s = line(90, 110);
    const res = eraseAt([s], { x: 100, y: 100 });
    expect(res.erased).toBe(true);
    expect(res.strokes).toHaveLength(0);
  });

  it("discards single-point fragments", () => {
    // Points at 60, 70(erased)... only one point survives on the left.
    const s: Stroke = { ...line(0, 0), points: [{ x: 60, y: 100 }, { x: 95, y: 100 }, { x: 140, y: 100 }, { x: 150, y: 100 }] };
    const res = eraseAt([s], { x: 100, y: 100 });
    expect(res.strokes).toHaveLength(1);
    expect(res.strokes[0].points).toEqual([{ x: 140, y: 100 }, { x: 150, y: 100 }]);
  });
});

describe("move support", () => {
  it("finds the nearest stroke within the grab radius", () => {
    const a = line(0, 100, 100);
    const b = line(0, 100, 300);
    expect(findNearestStroke([a, b], { x: 50, y: 290 })).toBe(1);
    expect(findNearestStroke([a, b], { x: 50, y: 120 })).toBe(0);
    expect(findNearestStroke([a, b], { x: 600, y: 600 })).toBe(-1);
  });

  it("translates every point of a stroke", () => {
    const s = line(0, 10, 0, 5);
    translateStroke(s, 7, -3);
    expect(s.points).toEqual([
      { x: 7, y: -3 },
      { x: 12, y: -3 },
      { x: 17, y: -3 },
    ]);
  });
});

describe("rendering", () => {
  it("lightens colours toward white", () => {
    expect(lightenColor("#000000", 0.5)).toBe("rgb(128, 128, 128)");
    expect(lightenColor("#00f0ff", 0.5)).toBe("rgb(128, 248, 255)");
    expect(lightenColor("#ffffff", 0.5)).toBe("rgb(255, 255, 255)");
  });

  it("draws three layers (halo, glow, core) when glow > 0, using thickness", () => {
    const { ctx, strokes } = mockCtx();
    renderStroke(ctx, line(0, 50, 100, 5, { thickness: 10, glow: 100 }));
    expect(strokes.map((s) => s.lineWidth)).toEqual([30, 16, 10]);
    expect(strokes[0].globalAlpha).toBeCloseTo(0.1);
    expect(strokes[1].globalAlpha).toBeCloseTo(0.35);
    expect(strokes[2].globalAlpha).toBe(1);
    expect(strokes[0].shadowBlur).toBe(35);
    // Veyra's light canvas draws the core in the brush colour itself.
    expect(strokes[2].strokeStyle).toBe("#00f0ff");
  });

  it("can still lighten the core (the original dark-theme look)", () => {
    const { ctx, strokes } = mockCtx();
    renderStroke(ctx, line(0, 50, 100, 5, { glow: 100 }), 0.5);
    expect(strokes[2].strokeStyle).toBe(lightenColor("#00f0ff", 0.5));
  });

  it("scales glow with the glow setting", () => {
    const { ctx, strokes } = mockCtx();
    renderStroke(ctx, line(0, 50, 100, 5, { glow: 60 }));
    expect(strokes[0].shadowBlur).toBeCloseTo(35 * 0.6);
    expect(strokes[1].globalAlpha).toBeCloseTo(0.35 * 0.6);
  });

  it("draws only the core when glow is 0", () => {
    const { ctx, strokes } = mockCtx();
    renderStroke(ctx, line(0, 50, 100, 5, { glow: 0, thickness: 4 }));
    expect(strokes).toHaveLength(1);
    expect(strokes[0].lineWidth).toBe(4);
    expect(strokes[0].shadowBlur).toBe(0);
  });

  it("uses round caps and joins and skips single-point strokes", () => {
    const m = mockCtx();
    renderStroke(m.ctx, line(0, 50));
    for (const st of m.strokes) {
      expect(st.lineCap).toBe("round");
      expect(st.lineJoin).toBe("round");
    }
    const m2 = mockCtx();
    renderStroke(m2.ctx, { points: [{ x: 1, y: 1 }], color: "#ffffff", thickness: 6, glow: 60 });
    expect(m2.strokes).toHaveLength(0);
  });

  it("renderDrawing clears then draws committed and in-progress strokes", () => {
    const { ctx, calls, strokes } = mockCtx();
    renderDrawing(ctx, { width: 100, height: 100 }, [line(0, 50, 10, 5, { glow: 0 })], line(0, 50, 20, 5, { glow: 0 }));
    expect(calls[0]).toBe("clear");
    expect(strokes).toHaveLength(2);
  });
});

describe("particles", () => {
  it("spawns two particles per point and removes them as they fade", () => {
    const list: Particle[] = [];
    spawnParticles(list, { x: 10, y: 10 }, "#fff", () => 0.5);
    expect(list).toHaveLength(2);
    const { ctx } = mockCtx();
    for (let i = 0; i < 100; i++) stepParticles(ctx, list);
    expect(list).toHaveLength(0);
  });
});

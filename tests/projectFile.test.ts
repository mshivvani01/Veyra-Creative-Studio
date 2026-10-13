import { describe, expect, it } from "vitest";
import { LIMITS, createProject, parseProject, projectStrokesFor, serializeStroke } from "../src/lib/projectFile";
import type { Stroke } from "../src/types";

const strokes: Stroke[] = [
  {
    points: [{ x: 10.04, y: 20.06 }, { x: 30, y: 40 }, { x: 50, y: 45 }],
    color: "#e0654d",
    thickness: 8,
    glow: 60,
    brush: "pencil",
    opacity: 0.5,
  },
  { points: [{ x: 100, y: 100 }, { x: 200, y: 150 }], color: "#30223f", thickness: 4, glow: 0, brush: "pen", opacity: 1, shape: "arrow" },
];
const vp = { width: 1000, height: 800 };

describe("project files", () => {
  it("round-trips strokes, brushes, opacity, shapes and background", () => {
    const project = createProject("  My   sketch ", strokes, vp, "peach", new Date("2026-10-13T10:00:00Z"));
    expect(project.name).toBe("My sketch");
    const parsed = parseProject(JSON.parse(JSON.stringify(project)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.background).toBe("peach");
    const restored = projectStrokesFor(parsed.project, vp);
    expect(restored).toHaveLength(2);
    expect(restored[0]).toMatchObject({ color: "#e0654d", thickness: 8, brush: "pencil", opacity: 0.5 });
    expect(restored[0].points[0]).toEqual({ x: 10, y: 20.1 }); // 1-decimal precision
    expect(restored[1]).toMatchObject({ shape: "arrow", brush: "pen" });
  });

  it("accepts the JSON text form", () => {
    const text = JSON.stringify(createProject("x", strokes, vp, "ivory"));
    expect(parseProject(text).ok).toBe(true);
  });

  it("treats strokes saved before 2.0 (no brush) as neon", () => {
    expect(serializeStroke({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#000000", thickness: 2, glow: 50 }).b).toBe(
      "neon",
    );
  });

  it.each([
    ["not JSON", "{oops", /not valid JSON/],
    ["null", null, /does not contain/],
    ["wrong format", { format: "something-else" }, /not a Veyra project/],
    ["wrong version", { format: "veyra-project", version: 99 }, /Unsupported project version/],
  ])("rejects %s", (_label, data, msg) => {
    const r = parseProject(data);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  const base = () => JSON.parse(JSON.stringify(createProject("x", strokes, vp, "ivory")));

  it.each([
    ["missing canvas", (p: any) => delete p.canvas, /canvas size/],
    ["NaN coordinate", (p: any) => (p.strokes[0].p[0] = "NaN"), /invalid coordinate/],
    ["infinite coordinate", (p: any) => (p.strokes[0].p[1] = 1e300), /invalid coordinate/],
    ["odd point list", (p: any) => p.strokes[0].p.push(5), /invalid points/],
    ["bad colour", (p: any) => (p.strokes[0].c = "url(evil)"), /invalid colour/],
    ["bad thickness", (p: any) => (p.strokes[0].t = -3), /invalid thickness/],
    ["unknown brush", (p: any) => (p.strokes[0].b = "spray"), /unknown brush/],
    ["unknown shape", (p: any) => (p.strokes[1].s = "star"), /unknown shape/],
    ["shape with 3 points", (p: any) => (p.strokes[1].p = [0, 0, 1, 1, 2, 2]), /exactly two points/],
    ["strokes not array", (p: any) => (p.strokes = {}), /no stroke list/],
  ])("rejects malformed data: %s", (_label, mutate, msg) => {
    const p = base();
    mutate(p);
    const r = parseProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  it("rejects oversized projects", () => {
    const p = base();
    p.strokes = Array.from({ length: LIMITS.maxStrokes + 1 }, () => p.strokes[0]);
    expect(parseProject(p).ok).toBe(false);
  });

  it("clamps out-of-range opacity/glow and defaults an unknown background", () => {
    const p = base();
    p.strokes[0].o = 7;
    p.strokes[0].g = -20;
    p.background = "neon-green";
    const r = parseProject(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.strokes[0].o).toBe(1);
    expect(r.project.strokes[0].g).toBe(0);
    expect(r.project.background).toBe("ivory");
  });

  it("scales a drawing saved on a different screen size to fit and centre", () => {
    const project = createProject("x", [strokes[1]], { width: 2000, height: 1600 }, "ivory");
    const out = projectStrokesFor(project, { width: 1000, height: 1000 });
    // scale = min(1000/2000, 1000/1600) = 0.5; vertical offset = (1000 - 800) / 2 = 100
    expect(out[0].points[0]).toEqual({ x: 50, y: 150 });
    expect(out[0].thickness).toBe(2);
  });
});

import type { BackgroundId, BrushType, Point, ShapeKind, Stroke, Viewport } from "../types";
import { normalizeHex } from "./colors";

/**
 * Veyra project format (.veyra.json): a structured, compact representation
 * of the drawing (strokes + settings), not a screenshot. Used for local saves
 * and for project-file export/import.
 */
export const PROJECT_FORMAT = "veyra-project";
export const PROJECT_VERSION = 1;

export interface SerializedStroke {
  /** Flat [x0, y0, x1, y1, ...] in CSS px, 1 decimal. */
  p: number[];
  c: string;
  t: number;
  g: number;
  b: BrushType;
  o: number;
  s?: ShapeKind;
}

export interface VeyraProject {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  name: string;
  savedAt: string;
  canvas: Viewport;
  background: BackgroundId;
  strokes: SerializedStroke[];
}

export const LIMITS = {
  maxStrokes: 5000,
  maxPointsPerStroke: 20000,
  maxTotalPoints: 400000,
  maxNameLength: 80,
  maxCoordinate: 100000,
};

const BRUSHES: readonly BrushType[] = ["pen", "marker", "pencil", "highlighter", "neon"];
const SHAPES: readonly ShapeKind[] = ["line", "rect", "circle", "arrow"];
// Unknown backgrounds (incl. any dark ones) fall back to ivory: Veyra stays light.
const BACKGROUNDS: readonly BackgroundId[] = ["ivory", "white", "lavender", "peach", "transparent"];

const round1 = (n: number) => Math.round(n * 10) / 10;

export function serializeStroke(s: Stroke): SerializedStroke {
  const p: number[] = [];
  for (const pt of s.points) p.push(round1(pt.x), round1(pt.y));
  return {
    p,
    c: s.color,
    t: round1(s.thickness),
    g: Math.round(s.glow),
    b: s.brush ?? "neon",
    o: Math.round((s.opacity ?? 1) * 100) / 100,
    ...(s.shape ? { s: s.shape } : {}),
  };
}

export function deserializeStroke(s: SerializedStroke): Stroke {
  const points: Point[] = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) points.push({ x: s.p[i], y: s.p[i + 1] });
  return {
    points,
    color: s.c,
    thickness: s.t,
    glow: s.g,
    brush: s.b,
    opacity: s.o,
    ...(s.s ? { shape: s.s } : {}),
  };
}

export function createProject(
  name: string,
  strokes: readonly Stroke[],
  canvas: Viewport,
  background: BackgroundId,
  now = new Date(),
): VeyraProject {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: cleanName(name),
    savedAt: now.toISOString(),
    canvas: { width: Math.round(canvas.width), height: Math.round(canvas.height) },
    background,
    strokes: strokes.map(serializeStroke),
  };
}

export function cleanName(name: string): string {
  const n = name.replace(/\s+/g, " ").trim().slice(0, LIMITS.maxNameLength);
  return n || "Untitled artwork";
}

export type ParseResult = { ok: true; project: VeyraProject } | { ok: false; error: string };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Validates untrusted project data (from storage or an imported file).
 * Never throws; returns a user-readable error for malformed data.
 */
export function parseProject(data: unknown): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, error });
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return fail("The file is not valid JSON.");
    }
  }
  if (!data || typeof data !== "object") return fail("The file does not contain a Veyra project.");
  const d = data as Record<string, unknown>;
  if (d.format !== PROJECT_FORMAT) return fail("This is not a Veyra project file.");
  if (d.version !== PROJECT_VERSION) return fail(`Unsupported project version (${String(d.version)}).`);

  const canvas = d.canvas as Record<string, unknown> | undefined;
  if (!canvas || !isNum(canvas.width) || !isNum(canvas.height) || canvas.width <= 0 || canvas.height <= 0)
    return fail("The project's canvas size is missing or invalid.");
  if (canvas.width > LIMITS.maxCoordinate || canvas.height > LIMITS.maxCoordinate)
    return fail("The project's canvas size is too large.");

  const background = BACKGROUNDS.includes(d.background as BackgroundId) ? (d.background as BackgroundId) : "ivory";
  if (!Array.isArray(d.strokes)) return fail("The project has no stroke list.");
  if (d.strokes.length > LIMITS.maxStrokes) return fail("The project has too many strokes.");

  const strokes: SerializedStroke[] = [];
  let total = 0;
  for (let i = 0; i < d.strokes.length; i++) {
    const s = d.strokes[i] as Record<string, unknown>;
    const where = `Stroke ${i + 1}`;
    if (!s || typeof s !== "object") return fail(`${where} is malformed.`);
    if (!Array.isArray(s.p) || s.p.length < 4 || s.p.length % 2 !== 0) return fail(`${where} has invalid points.`);
    if (s.p.length / 2 > LIMITS.maxPointsPerStroke) return fail(`${where} has too many points.`);
    for (const v of s.p) {
      if (!isNum(v) || Math.abs(v) > LIMITS.maxCoordinate) return fail(`${where} has an invalid coordinate.`);
    }
    total += s.p.length / 2;
    if (total > LIMITS.maxTotalPoints) return fail("The project is too large to open.");
    const color = typeof s.c === "string" ? normalizeHex(s.c) : null;
    if (!color) return fail(`${where} has an invalid colour.`);
    if (!isNum(s.t) || s.t <= 0 || s.t > 200) return fail(`${where} has an invalid thickness.`);
    const glow = isNum(s.g) ? Math.min(100, Math.max(0, s.g)) : 0;
    if (!BRUSHES.includes(s.b as BrushType)) return fail(`${where} uses an unknown brush.`);
    const opacity = isNum(s.o) ? Math.min(1, Math.max(0.05, s.o)) : 1;
    let shape: ShapeKind | undefined;
    if (s.s !== undefined) {
      if (!SHAPES.includes(s.s as ShapeKind)) return fail(`${where} uses an unknown shape.`);
      if (s.p.length !== 4) return fail(`${where} is a shape but does not have exactly two points.`);
      shape = s.s as ShapeKind;
    }
    strokes.push({
      p: s.p as number[],
      c: color,
      t: s.t,
      g: glow,
      b: s.b as BrushType,
      o: opacity,
      ...(shape ? { s: shape } : {}),
    });
  }

  return {
    ok: true,
    project: {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      name: cleanName(typeof d.name === "string" ? d.name : ""),
      savedAt: typeof d.savedAt === "string" ? d.savedAt : new Date(0).toISOString(),
      canvas: { width: canvas.width, height: canvas.height },
      background,
      strokes,
    },
  };
}

/**
 * Converts a project's strokes to the current viewport: uniformly scaled so
 * the saved canvas fits the screen, and centred. Thickness scales too.
 */
export function projectStrokesFor(project: VeyraProject, viewport: Viewport): Stroke[] {
  const strokes = project.strokes.map(deserializeStroke);
  const { width: fw, height: fh } = project.canvas;
  const scale = Math.min(viewport.width / fw, viewport.height / fh);
  if (Math.abs(scale - 1) < 1e-3 && fw === viewport.width && fh === viewport.height) return strokes;
  const ox = (viewport.width - fw * scale) / 2;
  const oy = (viewport.height - fh * scale) / 2;
  return strokes.map((s) => ({
    ...s,
    thickness: Math.max(0.5, s.thickness * scale),
    points: s.points.map((p) => ({ x: ox + p.x * scale, y: oy + p.y * scale })),
  }));
}

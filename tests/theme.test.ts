import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BACKGROUNDS, BRAND, DEFAULTS } from "../src/lib/constants";
import { createProject, parseProject } from "../src/lib/projectFile";
import { ALL_COLORS, PALETTE } from "../src/lib/colors";
import { BACKGROUND } from "../src/lib/drawingEngine";

// WCAG relative luminance / contrast ratio.
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};

describe("Veyra brand & theme", () => {
  it("uses the exact brand name and tagline", () => {
    expect(BRAND.name).toBe("Veyra");
    expect(BRAND.wordmark).toBe("VEYRA");
    expect(BRAND.tagline).toBe("Your hands. Your imagination. Your canvas.");
  });

  it("defines the core palette as CSS custom properties", () => {
    expect(token("ivory").toLowerCase()).toBe("#f7f3ee");
    expect(token("plum").toLowerCase()).toBe("#30223f");
    expect(token("lavender").toLowerCase()).toBe("#c7a7f7");
    expect(token("coral").toLowerCase()).toBe("#f29b86");
  });

  it("offers a curated palette of 36 distinct colours in six groups", () => {
    expect(PALETTE).toHaveLength(6);
    for (const g of PALETTE) expect(g.colors).toHaveLength(6);
    expect(ALL_COLORS.length).toBeGreaterThanOrEqual(32);
    expect(new Set(ALL_COLORS.map((c) => c.value)).size).toBe(ALL_COLORS.length);
    expect(new Set(ALL_COLORS.map((c) => c.name)).size).toBe(ALL_COLORS.length);
  });

  it("default brush colour is in the palette and clearly visible on ivory (≥ 3:1)", () => {
    expect(ALL_COLORS.some((c) => c.value === DEFAULTS.color)).toBe(true);
    expect(contrast(DEFAULTS.color, BACKGROUND)).toBeGreaterThanOrEqual(3);
  });

  it("meets WCAG AA for text colours on white and ivory surfaces", () => {
    for (const fg of ["plum", "plum-2", "muted", "error-text"]) {
      expect(contrast(token(fg), token("white")), fg).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(fg), token("ivory")), fg).toBeGreaterThanOrEqual(4.4);
    }
    expect(contrast(token("ivory"), token("plum"))).toBeGreaterThanOrEqual(4.5); // primary button
  });

  it("selected-state ring and focus colour reach 3:1 against surfaces", () => {
    expect(contrast(token("lavender-strong"), token("white"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("lavender-strong"), token("ivory"))).toBeGreaterThanOrEqual(3);
  });

  it("has no leftover dark-theme background colours", () => {
    for (const old of ["#07070d", "#0e0e1a", "rgba(10, 10, 14"]) expect(css).not.toContain(old);
  });

  it("keeps the studio light: every canvas background is light (no dark theme)", () => {
    for (const b of BACKGROUNDS) {
      if (b.color === null) continue; // transparent
      expect(luminance(b.color), b.label).toBeGreaterThan(0.75);
    }
    expect(BACKGROUNDS.map((b) => b.id)).toEqual(["ivory", "white", "lavender", "peach", "transparent"]);
    // A project asking for a dark background opens on ivory.
    const p = JSON.parse(JSON.stringify(createProject("x", [], { width: 10, height: 10 }, "ivory")));
    p.background = "plum";
    const r = parseProject(p);
    expect(r.ok && r.project.background).toBe("ivory");
  });
});

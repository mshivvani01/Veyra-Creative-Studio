import { describe, expect, it } from "vitest";
import { exportFilename } from "../src/lib/exportImage";
import { isEditableTarget, matchShortcut, type KeyInput } from "../src/lib/shortcuts";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  target: { tagName: "CANVAS" } as unknown as EventTarget,
  ...mods,
});
const input = (type = "text") => ({ tagName: "INPUT", type }) as unknown as EventTarget;

describe("keyboard shortcuts", () => {
  it("maps undo/redo with Ctrl (Windows/Linux) and ⌘ (macOS)", () => {
    expect(matchShortcut(key("z", { ctrlKey: true }))).toEqual({ type: "undo" });
    expect(matchShortcut(key("z", { metaKey: true }))).toEqual({ type: "undo" });
    expect(matchShortcut(key("y", { ctrlKey: true }))).toEqual({ type: "redo" });
    expect(matchShortcut(key("Z", { ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(matchShortcut(key("z", { metaKey: true, shiftKey: true }))).toEqual({ type: "redo" });
  });

  it("maps clear, tools and escape", () => {
    expect(matchShortcut(key("Delete"))).toEqual({ type: "clear" });
    expect(matchShortcut(key("Backspace"))).toEqual({ type: "clear" });
    expect(matchShortcut(key("b"))).toEqual({ type: "tool", tool: "brush" });
    expect(matchShortcut(key("E"))).toEqual({ type: "tool", tool: "eraser" });
    expect(matchShortcut(key("l"))).toEqual({ type: "tool", tool: "line" });
    expect(matchShortcut(key("r"))).toEqual({ type: "tool", tool: "rect" });
    expect(matchShortcut(key("c"))).toEqual({ type: "tool", tool: "circle" });
    expect(matchShortcut(key("a"))).toEqual({ type: "tool", tool: "arrow" });
    expect(matchShortcut(key("Escape"))).toEqual({ type: "escape" });
  });

  it("does not hijack browser shortcuts", () => {
    expect(matchShortcut(key("c", { ctrlKey: true }))).toBeNull(); // copy
    expect(matchShortcut(key("r", { ctrlKey: true }))).toBeNull(); // reload
    expect(matchShortcut(key("b", { altKey: true }))).toBeNull();
    expect(matchShortcut(key("x"))).toBeNull();
  });

  it("never fires while typing in text fields (except Escape)", () => {
    for (const target of [input("text"), input("search"), { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }]) {
      const t = target as unknown as EventTarget;
      expect(matchShortcut(key("z", { ctrlKey: true, target: t }))).toBeNull();
      expect(matchShortcut(key("Backspace", { target: t }))).toBeNull();
      expect(matchShortcut(key("e", { target: t }))).toBeNull();
      expect(matchShortcut(key("Escape", { target: t }))).toEqual({ type: "escape" });
    }
  });

  it("still works when a slider or checkbox has focus", () => {
    expect(isEditableTarget(input("range"))).toBe(false);
    expect(isEditableTarget(input("checkbox"))).toBe(false);
    expect(matchShortcut(key("z", { ctrlKey: true, target: input("range") }))).toEqual({ type: "undo" });
  });
});

describe("export filename", () => {
  it("is meaningful and dated", () => {
    expect(exportFilename(new Date(2026, 9, 13, 15, 30, 12))).toBe("veyra-artwork-2026-10-13-153012.png");
    expect(exportFilename(new Date(2026, 0, 2, 3, 4, 5), "veyra.json")).toBe("veyra-artwork-2026-01-02-030405.veyra.json");
  });
});

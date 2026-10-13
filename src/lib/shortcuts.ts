import type { Tool } from "../types";

export type ShortcutAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "tool"; tool: Tool }
  | { type: "escape" };

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

export const SHORTCUT_HELP: { keys: string; action: string }[] = [
  { keys: "Ctrl/⌘ + Z", action: "Undo" },
  { keys: "Ctrl/⌘ + Y  ·  Ctrl/⌘ + Shift + Z", action: "Redo" },
  { keys: "Delete / Backspace", action: "Clear canvas (asks first)" },
  { keys: "B", action: "Brush" },
  { keys: "E", action: "Eraser" },
  { keys: "L · R · C · A", action: "Line · Rectangle · Circle · Arrow" },
  { keys: "Esc", action: "Close panel or dialog" },
];

/** True for inputs, textareas, selects and contenteditable elements. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!el || typeof el !== "object" || !("tagName" in el)) return false;
  const tag = String(el.tagName).toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = String((el as HTMLInputElement).type || "text").toLowerCase();
    // Range sliders and buttons don't take text; only block text-like inputs.
    return !["range", "checkbox", "radio", "button", "submit", "color"].includes(type);
  }
  return !!el.isContentEditable;
}

/**
 * Maps a key event to a studio action, or null. Never fires while the user
 * is typing in an editable element (except Escape, which closes panels).
 * Ctrl on Windows/Linux and ⌘ on macOS are both accepted.
 */
export function matchShortcut(e: KeyInput): ShortcutAction | null {
  if (e.key === "Escape") return { type: "escape" };
  if (isEditableTarget(e.target)) return null;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.altKey) {
    if (key === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
    if (key === "y") return { type: "redo" };
    return null;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === "Delete" || e.key === "Backspace") return { type: "clear" };
  if (e.shiftKey) return null;
  switch (key) {
    case "b":
      return { type: "tool", tool: "brush" };
    case "e":
      return { type: "tool", tool: "eraser" };
    case "l":
      return { type: "tool", tool: "line" };
    case "r":
      return { type: "tool", tool: "rect" };
    case "c":
      return { type: "tool", tool: "circle" };
    case "a":
      return { type: "tool", tool: "arrow" };
    default:
      return null;
  }
}

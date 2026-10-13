import type { BackgroundId, BrushType, CameraMode, Gesture, ShapeKind } from "../types";

export const BRAND = {
  name: "Veyra",
  wordmark: "VEYRA",
  tagline: "Your hands. Your imagination. Your canvas.",
} as const;

export const DEFAULTS = {
  /** Veyra coral; part of the curated palette (src/lib/colors.ts). */
  color: "#e0654d",
  thickness: 6,
  glow: 60,
  thicknessMin: 1,
  thicknessMax: 60,
  glowMin: 0,
  glowMax: 100,
  /** Neon keeps the studio's original look as the default brush. */
  brush: "neon" as BrushType,
  opacity: 1,
  opacityMinPct: 10,
  eraserSize: 28,
  eraserMin: 8,
  eraserMax: 120,
  smoothing: 50,
  background: "ivory" as BackgroundId,
};

/** Quick brush-size presets (px). */
export const SIZE_PRESETS = [
  { label: "XS", value: 2 },
  { label: "S", value: 4 },
  { label: "M", value: 8 },
  { label: "L", value: 16 },
  { label: "XL", value: 32 },
] as const;

export const BRUSHES: { id: BrushType; label: string; hint: string }[] = [
  { id: "pen", label: "Pen", hint: "Clean, solid line" },
  { id: "marker", label: "Marker", hint: "Soft, slightly translucent" },
  { id: "pencil", label: "Pencil", hint: "Thin, grainy graphite" },
  { id: "highlighter", label: "Highlighter", hint: "Wide and see-through" },
  { id: "neon", label: "Neon", hint: "Glowing light trail" },
];

export const SHAPE_TOOLS: { id: ShapeKind; label: string; key: string }[] = [
  { id: "line", label: "Line", key: "L" },
  { id: "rect", label: "Rectangle", key: "R" },
  { id: "circle", label: "Circle", key: "C" },
  { id: "arrow", label: "Arrow", key: "A" },
];

export interface BackgroundOption {
  id: BackgroundId;
  label: string;
  /** CSS colour; null = transparent. */
  color: string | null;
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: "ivory", label: "Warm ivory", color: "#f7f3ee" },
  { id: "white", label: "Pure white", color: "#ffffff" },
  { id: "lavender", label: "Light lavender", color: "#eee6f8" },
  { id: "peach", label: "Pale peach", color: "#f9e7df" },
  { id: "transparent", label: "Transparent", color: null },
];

export const backgroundById = (id: BackgroundId): BackgroundOption =>
  BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];

export type GestureIconName = "draw" | "erase" | "move" | "idle" | "ready" | "show";

export interface HudState {
  icon: GestureIconName;
  label: string;
  cls: "" | "drawing" | "erasing" | "grabbing";
}

/** The HUD before any gesture is processed. */
export const INITIAL_HUD: HudState = { icon: "ready", label: "Ready", cls: "" };

export const GESTURE_HUD: Record<Gesture, HudState> = {
  index_finger: { icon: "draw", label: "Drawing", cls: "drawing" },
  open_palm: { icon: "erase", label: "Erasing", cls: "erasing" },
  pinch: { icon: "move", label: "Grab", cls: "grabbing" },
  fist: { icon: "idle", label: "Idle", cls: "" },
  idle: { icon: "ready", label: "Ready", cls: "" },
  none: { icon: "show", label: "Show hand", cls: "" },
};

export const CAMERA_MODE_LABEL: Record<CameraMode, string> = {
  on: "Camera On",
  dim: "Camera Dim",
  dark: "Canvas Only",
};

export const NEXT_CAMERA_MODE: Record<CameraMode, CameraMode> = { on: "dim", dim: "dark", dark: "on" };

export const LOGO_SRC = `${import.meta.env.BASE_URL}veyra-logo.svg`;
export const MARK_SRC = `${import.meta.env.BASE_URL}veyra-mark.svg`;

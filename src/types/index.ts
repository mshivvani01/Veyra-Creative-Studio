/** A single MediaPipe hand landmark in normalized image coordinates (0..1). */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/** 21 landmarks, indexed per the MediaPipe hand model. */
export type HandLandmarks = readonly Landmark[];

export type Gesture =
  | "index_finger" // draw
  | "open_palm" // erase
  | "pinch" // grab & move
  | "fist" // idle / rest
  | "idle" // hand visible, no recognised pose
  | "none"; // no hand in frame

export interface Point {
  x: number;
  y: number;
}

/** Drawing brushes. ("eraser" is a tool, not a brush: it never creates strokes.) */
export type BrushType = "pen" | "marker" | "pencil" | "highlighter" | "neon";

/** Geometric shapes, stored as two points: [start, end]. */
export type ShapeKind = "line" | "rect" | "circle" | "arrow";

/** The active tool: freehand brush, eraser, or a shape. */
export type Tool = "brush" | "eraser" | ShapeKind;

export interface Stroke {
  points: Point[];
  color: string;
  thickness: number;
  /** Glow intensity, 0..100 (used by the neon brush). */
  glow: number;
  /** Brush used to render this stroke. Missing = "neon" (strokes saved before Veyra 2.0). */
  brush?: BrushType;
  /** Stroke opacity, 0.05..1. Missing = 1. */
  opacity?: number;
  /** Set for shapes; points are then [start, end]. Missing = freehand. */
  shape?: ShapeKind;
}

/** Canvas backgrounds: all light, to keep Veyra's light editorial theme. */
export type BackgroundId = "ivory" | "white" | "lavender" | "peach" | "transparent";

/** Camera view cycles ON -> DIM -> Dark Canvas -> ON, exactly like the reference. */
export type CameraMode = "on" | "dim" | "dark";

export type AppPhase = "loading" | "ready" | "error";

export interface Viewport {
  width: number;
  height: number;
}

/** Size of the source video frame, used for object-fit: cover mapping. */
export interface FrameSize {
  width: number;
  height: number;
}

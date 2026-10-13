import type { FrameSize, HandLandmarks, Landmark, Point, Viewport } from "../types";

/** MediaPipe hand landmark indices. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export const FINGERTIPS = [4, 8, 12, 16, 20] as const;

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Hand scale: wrist -> middle-finger MCP. Used to make every distance
 * threshold independent of how close the hand is to the camera.
 */
export function palmSize(lm: HandLandmarks): number {
  return Math.max(distance(lm[LM.WRIST], lm[LM.MIDDLE_MCP]), 1e-6);
}

/**
 * Maps a normalized landmark to screen (CSS pixel) coordinates.
 *
 * The camera image is drawn mirrored and scaled with "object-fit: cover"
 * semantics, so the same transform must be applied to landmarks for the
 * fingertip to line up with the on-screen hand. When no frame size is
 * given (or aspect ratios match) this reduces to the reference's
 * `{ x: (1 - x) * width, y: y * height }`.
 */
export function toScreen(lm: Landmark, viewport: Viewport, frame?: FrameSize | null): Point {
  const mx = 1 - lm.x; // mirror horizontally (selfie view)
  if (!frame || frame.width <= 0 || frame.height <= 0) {
    return { x: mx * viewport.width, y: lm.y * viewport.height };
  }
  const { drawW, drawH, offsetX, offsetY } = coverRect(frame, viewport);
  return { x: offsetX + mx * drawW, y: offsetY + lm.y * drawH };
}

/** Rectangle (in viewport pixels) a frame occupies when drawn with object-fit: cover. */
export function coverRect(frame: FrameSize, viewport: Viewport) {
  const scale = Math.max(viewport.width / frame.width, viewport.height / frame.height);
  const drawW = frame.width * scale;
  const drawH = frame.height * scale;
  return {
    drawW,
    drawH,
    offsetX: (viewport.width - drawW) / 2,
    offsetY: (viewport.height - drawH) / 2,
  };
}

/** Midpoint of two landmarks mapped to screen space. */
export function midpointToScreen(
  a: Landmark,
  b: Landmark,
  viewport: Viewport,
  frame?: FrameSize | null,
): Point {
  return toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, viewport, frame);
}

/** Palm centre used by the eraser: between wrist and middle MCP (as in the reference). */
export function palmCenter(lm: HandLandmarks, viewport: Viewport, frame?: FrameSize | null): Point {
  return midpointToScreen(lm[LM.WRIST], lm[LM.MIDDLE_MCP], viewport, frame);
}

/** Grab point used by the move gesture: between thumb tip and index tip. */
export function pinchPoint(lm: HandLandmarks, viewport: Viewport, frame?: FrameSize | null): Point {
  return midpointToScreen(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP], viewport, frame);
}

/**
 * Exponential moving-average smoother for the drawing pointer.
 * factor = 0.35 matches the reference implementation.
 */
export class PointSmoother {
  private pos: Point | null = null;

  factor: number;

  constructor(factor = 0.35) {
    this.factor = factor;
  }

  next(target: Point): Point {
    if (!this.pos) {
      this.pos = { ...target };
    } else {
      this.pos = {
        x: this.pos.x + (target.x - this.pos.x) * this.factor,
        y: this.pos.y + (target.y - this.pos.y) * this.factor,
      };
    }
    return { ...this.pos };
  }

  reset(to?: Point): void {
    this.pos = to ? { ...to } : null;
  }
}

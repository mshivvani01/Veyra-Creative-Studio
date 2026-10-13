import type { Gesture, HandLandmarks } from "../types";
import { LM, distance, palmSize } from "./handCoordinates";

/**
 * Tunable thresholds. All distances are relative to palm size
 * (wrist -> middle MCP) so classification does not depend on how far the
 * hand is from the camera, and finger extension is measured from the
 * wrist so it keeps working when the hand is tilted or rotated.
 */
export const GESTURE_THRESHOLDS = {
  /** Finger counts as extended when wrist->tip > wrist->PIP * this. */
  extendedRatio: 1.12,
  /** Finger counts as curled when wrist->tip < wrist->PIP * this. */
  curledRatio: 1.0,
  /** Thumb-index tip distance / palm size to ENTER a pinch. */
  pinchEnter: 0.33,
  /** Thumb-index tip distance / palm size to STAY in a pinch (hysteresis). */
  pinchExit: 0.45,
  /** Index tip must reach at least this far (vs. its MCP) for a pinch, so a fist is not a pinch. */
  pinchIndexReach: 1.15,
  /** Thumb tip distance from middle MCP / palm size for the thumb to count as spread (diagnostic only). */
  thumbSpread: 0.55,
  /** Minimum handedness/presence score to trust a detection. */
  minConfidence: 0.5,
} as const;

export type FingerState = "extended" | "curled" | "partial";

type FingerName = "index" | "middle" | "ring" | "pinky";

const FINGER_JOINTS: Record<FingerName, { mcp: number; pip: number; tip: number }> = {
  index: { mcp: LM.INDEX_MCP, pip: LM.INDEX_PIP, tip: LM.INDEX_TIP },
  middle: { mcp: LM.MIDDLE_MCP, pip: LM.MIDDLE_PIP, tip: LM.MIDDLE_TIP },
  ring: { mcp: LM.RING_MCP, pip: LM.RING_PIP, tip: LM.RING_TIP },
  pinky: { mcp: LM.PINKY_MCP, pip: LM.PINKY_PIP, tip: LM.PINKY_TIP },
};

export function fingerState(lm: HandLandmarks, finger: FingerName, t = GESTURE_THRESHOLDS): FingerState {
  const j = FINGER_JOINTS[finger];
  const wrist = lm[LM.WRIST];
  const tipDist = distance(wrist, lm[j.tip]);
  const pipDist = distance(wrist, lm[j.pip]);
  if (tipDist > pipDist * t.extendedRatio) return "extended";
  if (tipDist < pipDist * t.curledRatio) return "curled";
  return "partial";
}

export function isThumbSpread(lm: HandLandmarks, t = GESTURE_THRESHOLDS): boolean {
  return distance(lm[LM.THUMB_TIP], lm[LM.MIDDLE_MCP]) / palmSize(lm) > t.thumbSpread;
}

/** Thumb-tip to index-tip distance normalised by palm size. */
export function pinchRatio(lm: HandLandmarks): number {
  return distance(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / palmSize(lm);
}

export interface FingerSummary {
  index: FingerState;
  middle: FingerState;
  ring: FingerState;
  pinky: FingerState;
  thumbSpread: boolean;
  pinchRatio: number;
}

export function summarizeFingers(lm: HandLandmarks, t = GESTURE_THRESHOLDS): FingerSummary {
  return {
    index: fingerState(lm, "index", t),
    middle: fingerState(lm, "middle", t),
    ring: fingerState(lm, "ring", t),
    pinky: fingerState(lm, "pinky", t),
    thumbSpread: isThumbSpread(lm, t),
    pinchRatio: pinchRatio(lm),
  };
}

export interface ClassifyOptions {
  /** Currently active (stable) gesture, used for pinch hysteresis. */
  current?: Gesture;
  /** Detection confidence (e.g. handedness score) if available. */
  confidence?: number;
  thresholds?: typeof GESTURE_THRESHOLDS;
}

/**
 * Classifies a single frame of hand landmarks into a gesture.
 *
 * Priority follows the reference app: pinch > open palm > index > fist > idle.
 */
export function classifyGesture(lm: HandLandmarks | null | undefined, opts: ClassifyOptions = {}): Gesture {
  if (!lm || lm.length < 21) return "none";
  const t = opts.thresholds ?? GESTURE_THRESHOLDS;
  if (opts.confidence !== undefined && opts.confidence < t.minConfidence) return "none";

  const f = summarizeFingers(lm, t);
  const othersExtended = [f.middle, f.ring, f.pinky].filter((s) => s === "extended").length;

  // Pinch: thumb + index tips together, remaining fingers not raised.
  const pinchLimit = opts.current === "pinch" ? t.pinchExit : t.pinchEnter;
  const indexReach =
    distance(lm[LM.WRIST], lm[LM.INDEX_TIP]) / Math.max(distance(lm[LM.WRIST], lm[LM.INDEX_MCP]), 1e-6);
  if (f.pinchRatio < pinchLimit && othersExtended === 0 && indexReach > t.pinchIndexReach) {
    return "pinch";
  }

  // Open palm: all four fingers extended. The thumb is NOT required to be
  // spread: in live-webcam recordings most open palms were held with the
  // thumb alongside the index finger, and requiring a spread thumb rejected
  // ~70% of them. Four extended fingers is already unambiguous.
  if (f.index === "extended" && othersExtended === 3) {
    return "open_palm";
  }

  // Draw: index extended, middle clearly curled, ring & pinky not raised.
  if (f.index === "extended" && f.middle === "curled" && f.ring !== "extended" && f.pinky !== "extended") {
    return "index_finger";
  }

  // Fist: no finger extended and the main fingers curled.
  if (f.index !== "extended" && othersExtended === 0 && f.middle === "curled" && f.ring === "curled") {
    return "fist";
  }

  return "idle";
}

/**
 * Temporal smoothing: a new gesture must be observed for several consecutive
 * frames before it becomes active (3 frames for pinch, 4 for everything
 * else, matching the reference). "none" (hand lost) applies immediately.
 */
export class GestureStabilizer {
  current: Gesture;
  private candidate: Gesture;
  private count = 0;

  constructor(
    initial: Gesture = "idle",
    private framesFor: (g: Gesture) => number = (g) => (g === "pinch" ? 3 : 4),
  ) {
    this.current = initial;
    this.candidate = initial;
  }

  /** Feed one raw classification. Returns the stable gesture and whether it changed. */
  push(raw: Gesture): { gesture: Gesture; changed: boolean; previous: Gesture } {
    const previous = this.current;
    if (raw === this.current) {
      this.candidate = raw;
      this.count = 0;
      return { gesture: this.current, changed: false, previous };
    }
    if (raw === "none") {
      this.current = "none";
      this.candidate = "none";
      this.count = 0;
      return { gesture: "none", changed: true, previous };
    }
    if (raw === this.candidate) this.count++;
    else {
      this.candidate = raw;
      this.count = 1;
    }
    if (this.count >= this.framesFor(raw)) {
      this.current = raw;
      this.count = 0;
      return { gesture: raw, changed: true, previous };
    }
    return { gesture: this.current, changed: false, previous };
  }

  reset(to: Gesture = "idle"): void {
    this.current = to;
    this.candidate = to;
    this.count = 0;
  }
}

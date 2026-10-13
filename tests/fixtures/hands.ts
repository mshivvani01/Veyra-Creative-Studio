/**
 * SYNTHETIC hand-landmark fixtures for unit tests.
 *
 * These are hand-built 21-point skeletons in MediaPipe's normalized image
 * space (palm facing the camera, fingers pointing up). They exercise the
 * geometry of the classifier but are NOT recordings of a real hand, and
 * passing tests on them is not evidence of real-webcam accuracy.
 */
import type { Landmark } from "../../src/types";

type FingerPose = "ext" | "curl";
type ThumbPose = "spread" | "tucked" | "pinch";

export interface PoseSpec {
  index: FingerPose | "pinch";
  middle: FingerPose;
  ring: FingerPose;
  pinky: FingerPose;
  thumb: ThumbPose;
}

const WRIST = { x: 0.5, y: 0.8 };
const MCP = {
  index: { x: 0.44, y: 0.62 },
  middle: { x: 0.49, y: 0.6 },
  ring: { x: 0.54, y: 0.61 },
  pinky: { x: 0.58, y: 0.64 },
};

function finger(mcp: { x: number; y: number }, pose: FingerPose): Landmark[] {
  if (pose === "ext") {
    return [
      { ...mcp },
      { x: mcp.x, y: mcp.y - 0.06 },
      { x: mcp.x, y: mcp.y - 0.1 },
      { x: mcp.x, y: mcp.y - 0.135 },
    ];
  }
  // Curled: tip folds back down below the MCP, toward the wrist.
  return [
    { ...mcp },
    { x: mcp.x, y: mcp.y - 0.045 },
    { x: mcp.x + 0.005, y: mcp.y - 0.02 },
    { x: mcp.x + 0.005, y: mcp.y + 0.02 },
  ];
}

const PINCH_POINT = { x: 0.37, y: 0.55 };

export function makeHand(spec: PoseSpec): Landmark[] {
  const lm: Landmark[] = [{ ...WRIST }];

  // Thumb: CMC, MCP, IP, TIP
  if (spec.thumb === "spread") {
    lm.push({ x: 0.45, y: 0.76 }, { x: 0.4, y: 0.71 }, { x: 0.36, y: 0.67 }, { x: 0.33, y: 0.63 });
  } else if (spec.thumb === "tucked") {
    lm.push({ x: 0.45, y: 0.76 }, { x: 0.42, y: 0.71 }, { x: 0.42, y: 0.66 }, { x: 0.47, y: 0.63 });
  } else {
    lm.push({ x: 0.45, y: 0.76 }, { x: 0.41, y: 0.7 }, { x: 0.38, y: 0.62 }, { ...PINCH_POINT });
  }

  if (spec.index === "pinch") {
    lm.push({ ...MCP.index }, { x: 0.42, y: 0.56 }, { x: 0.4, y: 0.53 }, { x: PINCH_POINT.x + 0.01, y: PINCH_POINT.y });
  } else {
    lm.push(...finger(MCP.index, spec.index));
  }
  lm.push(...finger(MCP.middle, spec.middle));
  lm.push(...finger(MCP.ring, spec.ring));
  lm.push(...finger(MCP.pinky, spec.pinky));
  return lm;
}

export const POSES = {
  point: makeHand({ index: "ext", middle: "curl", ring: "curl", pinky: "curl", thumb: "tucked" }),
  openPalm: makeHand({ index: "ext", middle: "ext", ring: "ext", pinky: "ext", thumb: "spread" }),
  pinch: makeHand({ index: "pinch", middle: "curl", ring: "curl", pinky: "curl", thumb: "pinch" }),
  fist: makeHand({ index: "curl", middle: "curl", ring: "curl", pinky: "curl", thumb: "tucked" }),
  /** Peace sign — not one of the four gestures, should be "idle". */
  peace: makeHand({ index: "ext", middle: "ext", ring: "curl", pinky: "curl", thumb: "tucked" }),
};

/** Rotates (radians, around the wrist), scales and translates a hand. */
export function transformHand(
  lm: readonly Landmark[],
  { rotate = 0, scale = 1, dx = 0, dy = 0 }: { rotate?: number; scale?: number; dx?: number; dy?: number },
): Landmark[] {
  const c = Math.cos(rotate);
  const s = Math.sin(rotate);
  return lm.map((p) => {
    const x = (p.x - WRIST.x) * scale;
    const y = (p.y - WRIST.y) * scale;
    return { x: WRIST.x + x * c - y * s + dx, y: WRIST.y + x * s + y * c + dy };
  });
}

/** Moves the index fingertip of a pointing hand to (x, y) in normalized space. */
export function pointAt(x: number, y: number): Landmark[] {
  const tip = POSES.point[8];
  return transformHand(POSES.point, { dx: x - tip.x, dy: y - tip.y });
}

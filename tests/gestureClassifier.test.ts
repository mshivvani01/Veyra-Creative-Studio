import { describe, expect, it } from "vitest";
import {
  GESTURE_THRESHOLDS,
  GestureStabilizer,
  classifyGesture,
  fingerState,
  isThumbSpread,
  pinchRatio,
} from "../src/lib/gestureClassifier";
import type { Gesture } from "../src/types";
import { POSES, makeHand, transformHand } from "./fixtures/hands";

// NOTE: all landmark data here is synthetic (see tests/fixtures/hands.ts).

describe("finger extension detection", () => {
  it("detects an extended index finger and curled others when pointing", () => {
    expect(fingerState(POSES.point, "index")).toBe("extended");
    expect(fingerState(POSES.point, "middle")).toBe("curled");
    expect(fingerState(POSES.point, "ring")).toBe("curled");
    expect(fingerState(POSES.point, "pinky")).toBe("curled");
  });

  it("detects all fingers extended for an open palm", () => {
    for (const f of ["index", "middle", "ring", "pinky"] as const) {
      expect(fingerState(POSES.openPalm, f)).toBe("extended");
    }
    expect(isThumbSpread(POSES.openPalm)).toBe(true);
  });

  it("detects a tucked thumb in a fist", () => {
    expect(isThumbSpread(POSES.fist)).toBe(false);
  });
});

describe("pinch distance", () => {
  it("is small for a pinch and large for an open palm", () => {
    expect(pinchRatio(POSES.pinch)).toBeLessThan(GESTURE_THRESHOLDS.pinchEnter);
    expect(pinchRatio(POSES.openPalm)).toBeGreaterThan(GESTURE_THRESHOLDS.pinchExit);
  });

  it("is scale invariant (hand closer / farther from the camera)", () => {
    const far = transformHand(POSES.pinch, { scale: 0.5 });
    const near = transformHand(POSES.pinch, { scale: 1.6 });
    expect(pinchRatio(far)).toBeCloseTo(pinchRatio(POSES.pinch), 6);
    expect(pinchRatio(near)).toBeCloseTo(pinchRatio(POSES.pinch), 6);
  });
});

describe("classifyGesture", () => {
  it.each([
    ["point", "index_finger"],
    ["openPalm", "open_palm"],
    ["pinch", "pinch"],
    ["fist", "fist"],
    ["peace", "idle"],
  ] as const)("classifies %s as %s", (pose, expected) => {
    expect(classifyGesture(POSES[pose])).toBe(expected);
  });

  it("returns none without a hand or with too few landmarks", () => {
    expect(classifyGesture(null)).toBe("none");
    expect(classifyGesture(undefined)).toBe("none");
    expect(classifyGesture(POSES.point.slice(0, 10))).toBe("none");
  });

  it("rejects low-confidence detections", () => {
    expect(classifyGesture(POSES.point, { confidence: 0.2 })).toBe("none");
    expect(classifyGesture(POSES.point, { confidence: 0.9 })).toBe("index_finger");
  });

  it("is robust to hand rotation and scale", () => {
    for (const rotate of [-0.6, -0.3, 0.3, 0.6, Math.PI / 2]) {
      for (const scale of [0.6, 1, 1.4]) {
        expect(classifyGesture(transformHand(POSES.point, { rotate, scale }))).toBe("index_finger");
        expect(classifyGesture(transformHand(POSES.openPalm, { rotate, scale }))).toBe("open_palm");
        expect(classifyGesture(transformHand(POSES.fist, { rotate, scale }))).toBe("fist");
        expect(classifyGesture(transformHand(POSES.pinch, { rotate, scale }))).toBe("pinch");
      }
    }
  });

  it("does not treat a fist as a pinch even though thumb and index are close", () => {
    expect(pinchRatio(POSES.fist)).toBeLessThan(GESTURE_THRESHOLDS.pinchEnter);
    expect(classifyGesture(POSES.fist)).toBe("fist");
  });

  it("applies hysteresis to the pinch threshold", () => {
    // Open the pinch slightly so the ratio sits between enter and exit thresholds.
    const hand = makeHand({ index: "pinch", middle: "curl", ring: "curl", pinky: "curl", thumb: "pinch" });
    const between = (GESTURE_THRESHOLDS.pinchEnter + GESTURE_THRESHOLDS.pinchExit) / 2;
    const palm = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
    hand[4] = { x: hand[8].x - between * palm, y: hand[8].y };
    expect(pinchRatio(hand)).toBeCloseTo(between, 5);
    expect(classifyGesture(hand, { current: "idle" })).not.toBe("pinch");
    expect(classifyGesture(hand, { current: "pinch" })).toBe("pinch");
  });
});

describe("GestureStabilizer (temporal smoothing)", () => {
  const feed = (s: GestureStabilizer, g: Gesture, n: number) => {
    let r = s.push(g);
    for (let i = 1; i < n; i++) r = s.push(g);
    return r;
  };

  it("requires 4 consecutive frames to switch to a drawing gesture", () => {
    const s = new GestureStabilizer("idle");
    expect(feed(s, "index_finger", 3).gesture).toBe("idle");
    const r = s.push("index_finger");
    expect(r).toEqual({ gesture: "index_finger", changed: true, previous: "idle" });
  });

  it("requires only 3 frames for pinch", () => {
    const s = new GestureStabilizer("idle");
    expect(feed(s, "pinch", 2).gesture).toBe("idle");
    expect(s.push("pinch").gesture).toBe("pinch");
  });

  it("resets the count when the raw gesture flickers", () => {
    const s = new GestureStabilizer("idle");
    feed(s, "index_finger", 3);
    s.push("open_palm");
    expect(feed(s, "index_finger", 3).gesture).toBe("idle");
  });

  it("switches to none immediately when the hand is lost", () => {
    const s = new GestureStabilizer("index_finger");
    expect(s.push("none")).toEqual({ gesture: "none", changed: true, previous: "index_finger" });
  });

  it("reports no change while the gesture is steady", () => {
    const s = new GestureStabilizer("fist");
    expect(s.push("fist").changed).toBe(false);
  });
});

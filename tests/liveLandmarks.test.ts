import { describe, expect, it } from "vitest";
import { GestureStabilizer, classifyGesture, isThumbSpread } from "../src/lib/gestureClassifier";
import type { Gesture, Landmark } from "../src/types";
import { makeHand } from "./fixtures/hands";
import data from "./fixtures/live-webcam-landmarks.json";

/*
 * REAL landmark data recorded from a live webcam session (coordinates only,
 * recorded with consent — see the fixture's "_about"). These guard the
 * classifier thresholds against regressions on a real hand. One person and
 * one camera is a small sample: it is evidence, not a general accuracy claim.
 */

const frames = (phase: keyof typeof data.phases): Landmark[][] =>
  data.phases[phase].map((f) => f.map(([x, y]) => ({ x, y })));

const accuracy = (lms: Landmark[][], expected: Gesture) =>
  lms.filter((lm) => classifyGesture(lm) === expected).length / lms.length;

/** Gesture that the stabiliser holds for the most frames over a sequence. */
function dominantStable(lms: Landmark[][]): Gesture {
  const s = new GestureStabilizer("idle");
  const counts = new Map<Gesture, number>();
  for (const lm of lms) {
    const g = s.push(classifyGesture(lm, { current: s.current })).gesture;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

describe("classifier on live-webcam landmarks", () => {
  it("has enough recorded frames", () => {
    expect(frames("point").length).toBeGreaterThan(40);
    expect(frames("open_palm").length).toBeGreaterThan(40);
    expect(frames("pinch").length).toBeGreaterThan(15);
  });

  it("recognises a real open palm, including with the thumb held in", () => {
    const palms = frames("open_palm");
    expect(accuracy(palms, "open_palm")).toBeGreaterThanOrEqual(0.95);
    // Regression: these frames used to be rejected for not having a spread thumb.
    const thumbIn = palms.filter((lm) => !isThumbSpread(lm));
    expect(thumbIn.length).toBeGreaterThan(10);
    for (const lm of thumbIn) expect(classifyGesture(lm)).toBe("open_palm");
  });

  it("recognises a real pointing hand", () => {
    expect(accuracy(frames("point"), "index_finger")).toBeGreaterThanOrEqual(0.8);
  });

  it("recognises a real pinch", () => {
    expect(accuracy(frames("pinch"), "pinch")).toBeGreaterThanOrEqual(0.7);
  });

  it.each(["point", "open_palm", "pinch"] as const)("stabilised gesture over the %s sequence is correct", (phase) => {
    const expected: Record<typeof phase, Gesture> = { point: "index_finger", open_palm: "open_palm", pinch: "pinch" };
    expect(dominantStable(frames(phase))).toBe(expected[phase]);
  });

  it("never mistakes a real open palm or pointing hand for a pinch", () => {
    for (const lm of [...frames("open_palm"), ...frames("point")]) {
      expect(classifyGesture(lm)).not.toBe("pinch");
    }
  });
});

describe("open palm (synthetic)", () => {
  it("accepts an open palm with the thumb tucked against the hand", () => {
    const hand = makeHand({ index: "ext", middle: "ext", ring: "ext", pinky: "ext", thumb: "tucked" });
    expect(isThumbSpread(hand)).toBe(false);
    expect(classifyGesture(hand)).toBe("open_palm");
  });
});

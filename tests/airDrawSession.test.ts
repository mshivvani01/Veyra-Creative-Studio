import { describe, expect, it } from "vitest";
import { AirDrawSession, DRAW_SETTLE_MS, type FrameInput } from "../src/lib/airDrawSession";
import type { Landmark } from "../src/types";
import { POSES, pointAt, transformHand } from "./fixtures/hands";

// Synthetic landmarks only — exercises the state machine, not real tracking.
const viewport = { width: 1000, height: 1000 };

function runner(session: AirDrawSession) {
  let now = 0;
  return {
    frame(landmarks: Landmark[] | null, dt = 33) {
      now += dt;
      const input: FrameInput = { landmarks, viewport, now };
      return session.update(input);
    },
    /** Feeds the same pose for n frames and returns the last output. */
    hold(landmarks: Landmark[] | null, n: number, dt = 33) {
      let out = this.frame(landmarks, dt);
      for (let i = 1; i < n; i++) out = this.frame(landmarks, dt);
      return out;
    },
  };
}

/** Enters draw mode and waits past the settle delay at the given tip position. */
function startDrawing(r: ReturnType<typeof runner>, x: number, y: number) {
  r.hold(pointAt(x, y), 4);
  r.hold(pointAt(x, y), Math.ceil(DRAW_SETTLE_MS / 33) + 1);
}

describe("AirDrawSession", () => {
  it("tracks gestures but does not draw while the onboarding modal is open", () => {
    const s = new AirDrawSession();
    const r = runner(s);
    const out = r.hold(pointAt(0.5, 0.5), 20);
    expect(out.gesture).toBe("index_finger");
    expect(out.cursor).not.toBeNull();
    expect(s.currentStroke).toBeNull();
    expect(s.strokes).toHaveLength(0);
  });

  it("draws a continuous stroke with the fingertip after the settle delay", () => {
    const s = new AirDrawSession();
    s.start();
    const r = runner(s);
    startDrawing(r, 0.5, 0.5);
    for (let i = 1; i <= 20; i++) r.frame(pointAt(0.5 - i * 0.01, 0.5));
    expect(s.currentStroke).not.toBeNull();
    const pts = s.currentStroke!.points;
    expect(pts.length).toBeGreaterThan(10);
    // Mirrored: moving the hand toward smaller x moves the stroke right.
    expect(pts[pts.length - 1].x).toBeGreaterThan(pts[0].x);
    // Continuity: no large gaps between consecutive points.
    for (let i = 1; i < pts.length; i++) {
      expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeLessThan(15);
    }
  });

  it("ignores fingertip motion during the settle period after entering draw mode", () => {
    const s = new AirDrawSession();
    s.start();
    const r = runner(s);
    r.hold(pointAt(0.5, 0.5), 4); // becomes index_finger
    r.frame(pointAt(0.4, 0.4));
    expect(s.currentStroke).toBeNull();
  });

  it("captures colour, thickness and glow per stroke", () => {
    const s = new AirDrawSession();
    s.start();
    Object.assign(s.brush, { color: "#ff00e5", thickness: 12, glow: 20 });
    const r = runner(s);
    startDrawing(r, 0.5, 0.5);
    r.hold(pointAt(0.45, 0.5), 5);
    r.hold(POSES.fist, 5);
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0]).toMatchObject({ color: "#ff00e5", thickness: 12, glow: 20 });
    s.brush.color = "#39ff14";
    expect(s.strokes[0].color).toBe("#ff00e5");
  });

  it("ends the stroke on fist and starts a NEW stroke on resume (no stray connecting line)", () => {
    const s = new AirDrawSession();
    s.start();
    const r = runner(s);
    startDrawing(r, 0.6, 0.3);
    r.hold(pointAt(0.55, 0.3), 5);
    const fist = r.hold(transformHand(POSES.fist, { dx: 0.1 }), 5);
    expect(fist.gesture).toBe("fist");
    expect(s.currentStroke).toBeNull();
    expect(s.strokes).toHaveLength(1);
    const firstEnd = s.strokes[0].points.at(-1)!;

    startDrawing(r, 0.3, 0.7);
    r.hold(pointAt(0.25, 0.7), 5);
    const second = s.currentStroke!;
    expect(second).not.toBeNull();
    expect(Math.hypot(second.points[0].x - firstEnd.x, second.points[0].y - firstEnd.y)).toBeGreaterThan(200);
  });

  it("commits the stroke when the hand leaves the frame", () => {
    const s = new AirDrawSession();
    s.start();
    const r = runner(s);
    startDrawing(r, 0.5, 0.5);
    r.hold(pointAt(0.45, 0.5), 5);
    const out = r.frame(null);
    expect(out.gesture).toBe("none");
    expect(out.changed).toBe(true);
    expect(s.currentStroke).toBeNull();
    expect(s.strokes).toHaveLength(1);
  });

  it("erases strokes under the open palm", () => {
    const s = new AirDrawSession();
    s.start();
    const palm = POSES.openPalm;
    const cx = (1 - (palm[0].x + palm[9].x) / 2) * 1000;
    const cy = ((palm[0].y + palm[9].y) / 2) * 1000;
    s.strokes = [
      { points: [{ x: cx - 100, y: cy }, { x: cx, y: cy }, { x: cx + 100, y: cy }], color: "#fff", thickness: 6, glow: 60 },
    ];
    const r = runner(s);
    const out = r.hold(palm, 5);
    expect(out.gesture).toBe("open_palm");
    expect(out.eraser).not.toBeNull();
    expect(s.strokes.flatMap((st) => st.points).some((p) => p.x === cx)).toBe(false);
  });

  it("pinch grabs the nearest stroke and moves it with the hand", () => {
    const s = new AirDrawSession();
    s.start();
    const pinch = POSES.pinch;
    const gx = (1 - (pinch[4].x + pinch[8].x) / 2) * 1000;
    const gy = ((pinch[4].y + pinch[8].y) / 2) * 1000;
    const near = { points: [{ x: gx + 10, y: gy }, { x: gx + 40, y: gy }], color: "#fff", thickness: 6, glow: 60 };
    const far = { points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], color: "#fff", thickness: 6, glow: 60 };
    s.strokes = [far, near];
    const r = runner(s);
    const grabbed = r.hold(pinch, 3);
    expect(grabbed.gesture).toBe("pinch");
    // The grabbed stroke is the near one (moved as a private copy so that
    // undo snapshots, which share the original object, are never mutated).
    expect(grabbed.grabTarget).toBe(s.strokes[1]);
    expect(grabbed.grabTarget?.points[0]).toEqual(near.points[0]);
    // Move the hand by -0.1 in normalized x => +100 px on the mirrored screen.
    r.hold(transformHand(pinch, { dx: -0.1, dy: 0.05 }), 2);
    expect(s.strokes[1].points[0].x).toBeCloseTo(gx + 110, 5);
    expect(s.strokes[1].points[0].y).toBeCloseTo(gy + 50, 5);
    expect(s.strokes[0].points[0]).toEqual({ x: 10, y: 10 });
    expect(near.points[0]).toEqual({ x: gx + 10, y: gy }); // original untouched
    // Releasing the pinch reports a drop.
    const released = r.hold(POSES.fist, 4);
    expect(released.dropped).toBe(true);
  });

  it("does not add a tail to the stroke during the frames that transition out of drawing", () => {
    const s = new AirDrawSession();
    s.start();
    const r = runner(s);
    startDrawing(r, 0.6, 0.3);
    r.hold(pointAt(0.5, 0.3), 6);
    // Jump straight to a fist far below: the stabiliser keeps "index_finger"
    // for 3 more frames, but none of those frames may extend the stroke.
    r.hold(transformHand(POSES.fist, { dy: 0.4 }), 6);
    expect(s.gesture).toBe("fist");
    expect(s.strokes).toHaveLength(1);
    for (const p of s.strokes[0].points) expect(p.y).toBeCloseTo(300, 0);
  });

  it("does not move a grabbed stroke during the frames that transition out of a pinch", () => {
    const s = new AirDrawSession();
    s.start();
    const pinch = POSES.pinch;
    const gx = (1 - (pinch[4].x + pinch[8].x) / 2) * 1000;
    const gy = ((pinch[4].y + pinch[8].y) / 2) * 1000;
    const stroke = { points: [{ x: gx, y: gy }, { x: gx + 30, y: gy }], color: "#fff", thickness: 6, glow: 60 };
    s.strokes = [stroke];
    const r = runner(s);
    r.hold(pinch, 3);
    r.hold(transformHand(pinch, { dy: 0.1 }), 2); // +100 px
    expect(s.strokes[0].points[0].y).toBeCloseTo(gy + 100, 5);
    // Release into a fist much further down; the stroke must stay where it was dropped.
    const out = r.hold(transformHand(POSES.fist, { dy: 0.15 }), 6);
    expect(out.gesture).toBe("fist");
    expect(s.strokes[0].points[0].y).toBeCloseTo(gy + 100, 5);
  });

  it("supports undo and clear", () => {
    const s = new AirDrawSession();
    s.addStroke({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#fff", thickness: 6, glow: 60 });
    s.addStroke({ points: [{ x: 5, y: 5 }, { x: 6, y: 6 }], color: "#fff", thickness: 6, glow: 60 });
    expect(s.undo()).toBe(true);
    expect(s.strokes).toHaveLength(1);
    expect(s.clear()).toBe(true);
    expect(s.strokes).toHaveLength(0);
    // Clear is itself undoable; then the first stroke can be undone too.
    expect(s.undo()).toBe(true);
    expect(s.strokes).toHaveLength(1);
    expect(s.undo()).toBe(true);
    expect(s.strokes).toHaveLength(0);
    expect(s.undo()).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { PointSmoother, coverRect, palmCenter, pinchPoint, toScreen } from "../src/lib/handCoordinates";
import { POSES } from "./fixtures/hands";

const vp = { width: 1280, height: 720 };

describe("coordinate mapping", () => {
  it("mirrors x and scales to the viewport when no frame size is known", () => {
    expect(toScreen({ x: 0, y: 0 }, vp)).toEqual({ x: 1280, y: 0 });
    expect(toScreen({ x: 1, y: 1 }, vp)).toEqual({ x: 0, y: 720 });
    expect(toScreen({ x: 0.25, y: 0.5 }, vp)).toEqual({ x: 960, y: 360 });
  });

  it("matches the plain mapping when the frame has the viewport's aspect ratio", () => {
    const frame = { width: 640, height: 360 };
    expect(toScreen({ x: 0.25, y: 0.5 }, vp, frame)).toEqual({ x: 960, y: 360 });
  });

  it("applies object-fit: cover cropping for a portrait viewport", () => {
    const phone = { width: 390, height: 844 };
    const frame = { width: 1280, height: 720 };
    const r = coverRect(frame, phone);
    expect(r.drawH).toBeCloseTo(844);
    expect(r.drawW).toBeCloseTo(1280 * (844 / 720));
    expect(r.offsetX).toBeLessThan(0);
    // The image centre maps to the screen centre.
    const c = toScreen({ x: 0.5, y: 0.5 }, phone, frame);
    expect(c.x).toBeCloseTo(195);
    expect(c.y).toBeCloseTo(422);
  });

  it("computes palm centre and pinch point in screen space", () => {
    const pc = palmCenter(POSES.openPalm, vp);
    const w = POSES.openPalm[0];
    const m = POSES.openPalm[9];
    expect(pc.x).toBeCloseTo((1 - (w.x + m.x) / 2) * 1280);
    expect(pc.y).toBeCloseTo(((w.y + m.y) / 2) * 720);
    const pp = pinchPoint(POSES.pinch, vp);
    expect(pp.x).toBeGreaterThan(0);
    expect(pp.y).toBeGreaterThan(0);
  });
});

describe("PointSmoother", () => {
  it("starts at the first point and then eases toward targets", () => {
    const s = new PointSmoother(0.35);
    expect(s.next({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    const p = s.next({ x: 100, y: 0 });
    expect(p.x).toBeCloseTo(35);
    const q = s.next({ x: 100, y: 0 });
    expect(q.x).toBeCloseTo(35 + 65 * 0.35);
  });

  it("reduces jitter amplitude", () => {
    const s = new PointSmoother(0.35);
    s.next({ x: 0, y: 0 });
    let maxDev = 0;
    for (let i = 0; i < 50; i++) {
      const noisy = { x: i % 2 === 0 ? 10 : -10, y: 0 };
      maxDev = Math.max(maxDev, Math.abs(s.next(noisy).x));
    }
    expect(maxDev).toBeLessThan(10);
  });

  it("can be reset to a point", () => {
    const s = new PointSmoother();
    s.next({ x: 5, y: 5 });
    s.reset({ x: 50, y: 60 });
    expect(s.next({ x: 50, y: 60 })).toEqual({ x: 50, y: 60 });
  });
});

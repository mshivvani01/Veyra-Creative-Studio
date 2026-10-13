import { expect, test, type Page } from "@playwright/test";
import type { Landmark } from "../../src/types";
import { toScreen } from "../../src/lib/handCoordinates";
import { POSES, pointAt, transformHand } from "../fixtures/hands";

/*
 * End-to-end gesture → drawing tests in a real browser.
 *
 * The camera is still the real (fake-device) MediaStream and the app's real
 * render loop, session state machine, canvases and toolbar are used — only
 * the MediaPipe HandLandmarker is replaced by a scripted one that returns
 * SYNTHETIC landmarks (tests/fixtures/hands.ts). This verifies everything
 * downstream of hand detection; it is not a live-webcam accuracy test.
 */

const VIEWPORT = { width: 1440, height: 900 };
const FRAME = { width: 320, height: 180 }; // tests/e2e/fixtures/blank-camera.y4m

test.use({ viewport: VIEWPORT, deviceScaleFactor: 1 });

const screen = (x: number, y: number) => toScreen({ x, y }, VIEWPORT, FRAME);

function moveCentre(hand: Landmark[], a: number, b: number, x: number, y: number): Landmark[] {
  const cx = (hand[a].x + hand[b].x) / 2;
  const cy = (hand[a].y + hand[b].y) / 2;
  return transformHand(hand, { dx: x - cx, dy: y - cy });
}
/** Open palm whose eraser centre (wrist ↔ middle MCP) is at (x, y). */
const palmAt = (x: number, y: number) => moveCentre(POSES.openPalm, 0, 9, x, y);
/** Pinch whose grab point (thumb tip ↔ index tip) is at (x, y). */
const pinchAt = (x: number, y: number) => moveCentre(POSES.pinch, 4, 8, x, y);
const fistAt = (x: number, y: number) => moveCentre(POSES.fist, 0, 9, x, y);

async function setPose(page: Page, pose: Landmark[] | null) {
  await page.evaluate((p) => ((window as unknown as { __pose: unknown }).__pose = p), pose);
}
async function hold(page: Page, pose: Landmark[] | null, ms: number) {
  await setPose(page, pose);
  await page.waitForTimeout(ms);
}
/** Interpolates a pose generator from t=0..1 over `steps` frames. */
async function sweep(page: Page, gen: (t: number) => Landmark[], steps = 24, stepMs = 70) {
  for (let i = 0; i <= steps; i++) {
    await setPose(page, gen(i / steps));
    await page.waitForTimeout(stepMs);
  }
}

/** Draws a horizontal stroke between normalized x0..x1 at y, then rests with a fist. */
async function drawLine(page: Page, x0: number, x1: number, y: number) {
  await hold(page, pointAt(x0, y), 900); // stabilise (4 frames) + 300 ms settle
  await sweep(page, (t) => pointAt(x0 + (x1 - x0) * t, y));
  await hold(page, fistAt(x1, y + 0.2), 700);
}

interface Stats {
  count: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

async function paintStats(page: Page, region?: { x0: number; y0: number; x1: number; y1: number }): Promise<Stats> {
  return page.evaluate((r) => {
    const c = document.querySelector<HTMLCanvasElement>("#drawing-canvas")!;
    const ctx = c.getContext("2d")!;
    const x0 = r?.x0 ?? 0, y0 = r?.y0 ?? 0;
    const w = (r ? r.x1 - r.x0 : c.width), h = (r ? r.y1 - r.y0 : c.height);
    const d = ctx.getImageData(x0, y0, w, h).data;
    const s = { count: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] > 40) {
          s.count++;
          s.minX = Math.min(s.minX, x + x0); s.maxX = Math.max(s.maxX, x + x0);
          s.minY = Math.min(s.minY, y + y0); s.maxY = Math.max(s.maxY, y + y0);
        }
    return s;
  }, region);
}

async function pixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => Array.from(document.querySelector<HTMLCanvasElement>("#drawing-canvas")!.getContext("2d")!
      .getImageData(Math.round(px), Math.round(py), 1, 1).data),
    [x, y] as const,
  );
}

/** Number of opaque pixels along a vertical line through x (stroke core width). */
async function coreWidth(page: Page, x: number, yCenter: number) {
  const s = await paintStats(page, { x0: Math.round(x), y0: Math.round(yCenter - 60), x1: Math.round(x) + 1, y1: Math.round(yCenter + 60) });
  return s.count;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__pose = null;
    w.__AIR_DRAW_TEST_LANDMARKER__ = {
      detectForVideo() {
        const p = w.__pose;
        return p
          ? { landmarks: [p], worldLandmarks: [], handedness: [[{ score: 0.95, index: 0, categoryName: "Right", displayName: "Right" }]] }
          : { landmarks: [], worldLandmarks: [], handedness: [] };
      },
      close() {},
    };
  });
  await page.goto("/");
  await page.locator("#btn-start").click({ timeout: 60_000 });
  await expect(page.locator("#onboarding-modal")).toHaveCount(0);
});

test("index finger draws a stroke that follows the fingertip; fist goes idle", async ({ page }) => {
  await hold(page, pointAt(0.62, 0.5), 900);
  await expect(page.locator("#gesture-label")).toHaveText("Drawing");
  await sweep(page, (t) => pointAt(0.62 - 0.24 * t, 0.5));
  await hold(page, fistAt(0.5, 0.7), 700);
  await expect(page.locator("#gesture-label")).toHaveText("Idle");

  const a = screen(0.62, 0.5); // mirrored: larger normalized x = further left
  const b = screen(0.38, 0.5);
  const s = await paintStats(page);
  expect(s.count).toBeGreaterThan(500);
  expect(s.minX).toBeLessThan(a.x + 40);
  expect(s.minX).toBeGreaterThan(a.x - 60);
  expect(s.maxX).toBeGreaterThan(b.x - 60);
  expect(s.maxX).toBeLessThan(b.x + 60);
  expect(Math.abs((s.minY + s.maxY) / 2 - a.y)).toBeLessThan(25);

  // Default brush is Veyra coral #e0654d = rgb(224, 101, 77); the core is drawn in the brush colour.
  const mid = screen(0.5, 0.5);
  const [r, g, bl, al] = await pixel(page, mid.x, mid.y);
  expect(al).toBeGreaterThan(200);
  expect(r).toBeGreaterThan(195);
  expect(g).toBeGreaterThan(70);
  expect(g).toBeLessThan(135);
  expect(bl).toBeLessThan(110);
});

test("hand leaving the frame shows 'Show hand' and stops the stroke", async ({ page }) => {
  await hold(page, pointAt(0.6, 0.4), 900);
  await sweep(page, (t) => pointAt(0.6 - 0.1 * t, 0.4), 10);
  await hold(page, null, 400);
  await expect(page.locator("#gesture-label")).toHaveText("Show hand");
  const before = await paintStats(page);
  expect(before.count).toBeGreaterThan(0);
  // A new stroke elsewhere must not connect to the old one.
  await drawLine(page, 0.6, 0.5, 0.7);
  const between = await paintStats(page, { x0: 0, y0: Math.round(screen(0, 0.5).y), x1: 1440, y1: Math.round(screen(0, 0.6).y) });
  expect(between.count).toBe(0);
});

test("selected colour and thickness are used for new strokes", async ({ page }) => {
  await page.click("#btn-brush-settings");
  await page.locator("#glow-slider").fill("0");
  await page.locator("#thickness-slider").fill("2");
  await page.keyboard.press("Escape");
  await drawLine(page, 0.62, 0.38, 0.3);
  await page.click("#btn-color");
  await page.click('#color-palette [data-color="#8b63d6"]');
  await page.keyboard.press("Escape");
  await page.click("#btn-brush-settings");
  await page.locator("#thickness-slider").fill("24");
  await page.keyboard.press("Escape");
  await drawLine(page, 0.62, 0.38, 0.6);

  const thin = screen(0.5, 0.3);
  const thick = screen(0.5, 0.6);
  const thinW = await coreWidth(page, thin.x, thin.y);
  const thickW = await coreWidth(page, thick.x, thick.y);
  expect(thinW).toBeGreaterThanOrEqual(1);
  expect(thinW).toBeLessThanOrEqual(5);
  expect(thickW).toBeGreaterThanOrEqual(20);
  expect(thickW).toBeLessThanOrEqual(30);

  // Lavender #8b63d6 = rgb(139, 99, 214); the earlier stroke stays coral.
  const [r, g, b] = await pixel(page, thick.x, thick.y);
  expect(r).toBeGreaterThan(110);
  expect(r).toBeLessThan(170);
  expect(g).toBeLessThan(130);
  expect(b).toBeGreaterThan(190);
  const [r2, g2] = await pixel(page, thin.x, thin.y);
  expect(r2).toBeGreaterThan(195);
  expect(g2).toBeLessThan(135);
});

test("glow setting changes the rendered halo", async ({ page }) => {
  await page.click("#btn-brush-settings");
  await page.locator("#glow-slider").fill("0");
  await page.keyboard.press("Escape");
  await drawLine(page, 0.62, 0.38, 0.3);
  await page.click("#btn-brush-settings");
  await page.locator("#glow-slider").fill("100");
  await page.keyboard.press("Escape");
  await drawLine(page, 0.62, 0.38, 0.6);
  const noGlow = screen(0.5, 0.3);
  const glow = screen(0.5, 0.6);
  // Halo region: 8–14 px away from the 6 px core.
  const halo = async (p: { x: number; y: number }) =>
    (await paintStats(page, { x0: Math.round(p.x) - 20, y0: Math.round(p.y) + 8, x1: Math.round(p.x) + 20, y1: Math.round(p.y) + 14 })).count;
  expect(await halo(noGlow)).toBe(0);
  expect(await halo(glow)).toBeGreaterThan(0);
});

test("undo removes the last stroke and clear removes everything", async ({ page }) => {
  await drawLine(page, 0.62, 0.38, 0.3);
  await drawLine(page, 0.62, 0.38, 0.6);
  const top = { x0: 0, y0: Math.round(screen(0, 0.25).y), x1: 1440, y1: Math.round(screen(0, 0.35).y) };
  const bottom = { x0: 0, y0: Math.round(screen(0, 0.55).y), x1: 1440, y1: Math.round(screen(0, 0.65).y) };
  expect((await paintStats(page, top)).count).toBeGreaterThan(0);
  expect((await paintStats(page, bottom)).count).toBeGreaterThan(0);

  await page.click("#btn-undo");
  await page.waitForTimeout(100);
  expect((await paintStats(page, top)).count).toBeGreaterThan(0);
  expect((await paintStats(page, bottom)).count).toBe(0);

  await page.click("#btn-clear");
  await page.click("#confirm-ok");
  await page.waitForTimeout(100);
  expect((await paintStats(page)).count).toBe(0);
});

test("open palm erases under the palm and splits the stroke", async ({ page }) => {
  await drawLine(page, 0.66, 0.34, 0.5);
  const centre = screen(0.5, 0.5);
  expect((await pixel(page, centre.x, centre.y))[3]).toBeGreaterThan(200);

  await hold(page, palmAt(0.5, 0.5), 700);
  await expect(page.locator("#gesture-label")).toHaveText("Erasing");
  await hold(page, fistAt(0.5, 0.9), 500);

  expect((await pixel(page, centre.x, centre.y))[3]).toBe(0);
  const left = screen(0.62, 0.5);
  const right = screen(0.38, 0.5);
  expect((await pixel(page, left.x, left.y))[3]).toBeGreaterThan(200);
  expect((await pixel(page, right.x, right.y))[3]).toBeGreaterThan(200);
});

test("pinch grabs the nearest stroke and moves it", async ({ page }) => {
  await drawLine(page, 0.6, 0.4, 0.3);
  const oldRow = { x0: 0, y0: Math.round(screen(0, 0.26).y), x1: 1440, y1: Math.round(screen(0, 0.34).y) };
  const newRow = { x0: 0, y0: Math.round(screen(0, 0.56).y), x1: 1440, y1: Math.round(screen(0, 0.64).y) };
  const before = await paintStats(page, oldRow);
  expect(before.count).toBeGreaterThan(0);

  await hold(page, pinchAt(0.5, 0.3), 500);
  await expect(page.locator("#gesture-label")).toHaveText("Grab");
  await sweep(page, (t) => pinchAt(0.5, 0.3 + 0.3 * t), 15);
  await hold(page, fistAt(0.5, 0.9), 600);

  expect((await paintStats(page, oldRow)).count).toBe(0);
  const after = await paintStats(page, newRow);
  expect(after.count).toBeGreaterThan(before.count * 0.8);
  // Horizontal extent unchanged by a vertical move.
  expect(Math.abs(after.minX - before.minX)).toBeLessThan(25);
});

test("fist (idle) never draws while the hand moves", async ({ page }) => {
  await hold(page, fistAt(0.6, 0.5), 600);
  await expect(page.locator("#gesture-label")).toHaveText("Idle");
  await sweep(page, (t) => fistAt(0.6 - 0.2 * t, 0.5), 12);
  expect((await paintStats(page)).count).toBe(0);
});

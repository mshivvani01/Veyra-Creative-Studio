import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Landmark } from "../../src/types";
import { POSES } from "../fixtures/hands";

/*
 * Veyra 2.0 studio features, exercised in a real browser with mouse/touch
 * input and real canvas pixels. The webcam is the fake-device feed and the
 * hand landmarker is a scripted stub (no hand unless a test sets a pose), so
 * these tests cover the studio UI and rendering, not hand-tracking accuracy.
 */

const VIEWPORT = { width: 1440, height: 900 };
test.use({ viewport: VIEWPORT, deviceScaleFactor: 1, acceptDownloads: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__pose = null;
    w.__AIR_DRAW_TEST_LANDMARKER__ = {
      detectForVideo() {
        const p = w.__pose;
        return p
          ? {
              landmarks: [p],
              worldLandmarks: [],
              handedness: [[{ score: 0.95 }]],
            }
          : { landmarks: [], worldLandmarks: [], handedness: [] };
      },
      close() {},
    };
  });
});

async function start(page: Page) {
  await page.goto("/");
  await page.locator("#btn-start").click({ timeout: 60_000 });
  await expect(page.locator("#onboarding-modal")).toHaveCount(0);
}

async function drag(page: Page, pts: [number, number][]) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}
const hline = (x0: number, x1: number, y: number): [number, number][] => [
  [x0, y],
  [(x0 + x1) / 2, y],
  [x1, y],
];

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** Painted-pixel statistics for a region of the drawing canvas. */
async function stats(page: Page, region?: Region) {
  return page.evaluate((region) => {
    const c = document.querySelector<HTMLCanvasElement>("#drawing-canvas")!;
    const r = region ?? { x0: 0, y0: 0, x1: c.width, y1: c.height };
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const d = c.getContext("2d")!.getImageData(r.x0, r.y0, w, h).data;
    let count = 0;
    let alphaSum = 0;
    let maxAlpha = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 20) {
        count++;
        alphaSum += d[i];
        maxAlpha = Math.max(maxAlpha, d[i]);
      }
    }
    return { count, meanAlpha: count ? alphaSum / count : 0, maxAlpha };
  }, region);
}
async function pixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) =>
      Array.from(
        document
          .querySelector<HTMLCanvasElement>("#drawing-canvas")!
          .getContext("2d")!
          .getImageData(x, y, 1, 1).data,
      ),
    [x, y] as const,
  );
}
const band = (y: number, half = 40): Region => ({
  x0: 0,
  y0: y - half,
  x1: 1300,
  y1: y + half,
});

async function setBrush(
  page: Page,
  opts: { brush?: string; size?: number; opacity?: number; glow?: number },
) {
  await page.click("#btn-brush-settings");
  if (opts.brush) await page.click(`.brush-option[data-brush="${opts.brush}"]`);
  if (opts.size !== undefined)
    await page.locator("#thickness-slider").fill(String(opts.size));
  if (opts.opacity !== undefined)
    await page.locator("#opacity-slider").fill(String(opts.opacity));
  // Glow only applies to (and is only enabled for) the neon brush.
  if (opts.glow !== undefined && (await page.locator("#glow-slider").isEnabled()))
    await page.locator("#glow-slider").fill(String(opts.glow));
  await page.keyboard.press("Escape");
}
async function pickColor(page: Page, hex: string) {
  await page.click("#btn-color");
  await page.click(`#color-palette [data-color="${hex}"]`);
  await page.keyboard.press("Escape");
}

// ------------------------------------------------------------------ colours --

test("every curated colour can be selected and is used for the next stroke", async ({
  page,
}) => {
  await start(page);
  await page.click("#btn-color");
  const swatches = page.locator("#color-palette .color-swatch");
  await expect(swatches).toHaveCount(36);
  const values = await swatches.evaluateAll((els) =>
    els.map((e) => [
      e.getAttribute("data-color"),
      e.getAttribute("aria-label"),
    ]),
  );
  for (const [hex, name] of values) {
    await page.click(`#color-palette [data-color="${hex}"]`);
    await expect(
      page.locator('#color-palette [aria-checked="true"]'),
    ).toHaveAttribute("data-color", hex!);
    await expect(page.locator("#current-color-name")).toHaveText(name!);
    await expect(page.locator("#active-color-preview")).toHaveAttribute(
      "title",
      name!,
    );
  }
  // Last selected is Magenta #e0218a: draw with it and check the pixel colour.
  await page.keyboard.press("Escape");
  await setBrush(page, { brush: "pen", size: 12 });
  await drag(page, hline(300, 600, 400));
  const [r, g, b, a] = await pixel(page, 450, 400);
  expect(a).toBe(255);
  expect([r, g, b]).toEqual([0xe0, 0x21, 0x8a]);
});

test("custom hex colours are validated, applied and remembered", async ({
  page,
}) => {
  await start(page);
  await page.click("#btn-color");
  const hex = page.locator("#custom-hex");
  for (const bad of ["#12", "zzzzzz", "#12345g"]) {
    await hex.fill(bad);
    await page.click("#custom-hex-apply");
    await expect(page.locator("#custom-hex-error")).toContainText(
      "Enter a hex colour",
    );
    await expect(hex).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#current-color-name")).toHaveText("Coral"); // unchanged
  }
  await hex.fill("3a7");
  await hex.press("Enter");
  await expect(page.locator("#custom-hex-error")).toBeHidden();
  await expect(page.locator(".color-current-hex")).toHaveText("#33AA77");
  await expect(
    page.locator('#recent-colors [data-color="#33aa77"]'),
  ).toHaveCount(1);
  // No preset is marked active for a custom colour; switching back to a preset works.
  await expect(
    page.locator('#color-palette [aria-checked="true"]'),
  ).toHaveCount(0);
  await page.click('#color-palette [data-color="#0047ab"]');
  await expect(page.locator("#current-color-name")).toHaveText("Cobalt");
  // Native colour picker.
  await page.locator("#custom-color-native").fill("#123456");
  await expect(page.locator(".color-current-hex")).toHaveText("#123456");
  await page.keyboard.press("Escape");
  await setBrush(page, { brush: "pen", size: 12 });
  await drag(page, hline(300, 600, 300));
  expect((await pixel(page, 450, 300)).slice(0, 3)).toEqual([0x12, 0x34, 0x56]);
});

test("recent colours persist across reloads and can be reselected", async ({
  page,
}) => {
  await start(page);
  await pickColor(page, "#1d5b36");
  await pickColor(page, "#f2a900");
  await pickColor(page, "#1d5b36"); // duplicate moves to the front, no repeat
  await page.reload();
  await page.locator("#btn-start").click({ timeout: 60_000 });
  await page.click("#btn-color");
  const recent = await page
    .locator("#recent-colors .color-swatch")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-color")));
  expect(recent.slice(0, 2)).toEqual(["#1d5b36", "#f2a900"]);
  expect(new Set(recent).size).toBe(recent.length);
  await page.click('#recent-colors [data-color="#f2a900"]');
  await expect(page.locator("#current-color-name")).toHaveText("Amber");
});

// ------------------------------------------------------------------ brushes --

test("brush presets produce visibly different strokes; opacity affects only new strokes", async ({
  page,
}) => {
  await start(page);
  await pickColor(page, "#30223f");
  const rows: Record<string, number> = {
    pen: 150,
    marker: 260,
    pencil: 370,
    highlighter: 480,
    neon: 590,
  };
  for (const [brush, y] of Object.entries(rows)) {
    await setBrush(page, { brush, size: 10, opacity: 100, glow: 60 });
    await drag(page, hline(250, 750, y));
  }
  const s: Record<string, Awaited<ReturnType<typeof stats>>> = {};
  for (const [brush, y] of Object.entries(rows))
    s[brush] = await stats(page, band(y));

  expect(s.pen.maxAlpha).toBe(255);
  expect(s.marker.count).toBeGreaterThan(s.pen.count * 1.3); // wider
  expect(s.marker.maxAlpha).toBeLessThan(230); // translucent
  expect(s.pencil.meanAlpha).toBeLessThan(s.pen.meanAlpha - 20); // softer graphite
  expect(s.highlighter.count).toBeGreaterThan(s.marker.count); // widest
  expect(s.highlighter.maxAlpha).toBeLessThan(110); // see-through
  expect(s.neon.count).toBeGreaterThan(s.pen.count * 1.5); // glow halo
  const signatures = Object.values(s).map(
    (v) => `${Math.round(v.count / 200)}:${Math.round(v.meanAlpha / 10)}`,
  );
  expect(new Set(signatures).size).toBe(5);

  // Opacity: a 30% pen stroke is translucent; the earlier pen stroke is unchanged.
  const penBefore = await stats(page, band(rows.pen));
  await setBrush(page, { brush: "pen", opacity: 30 });
  await drag(page, hline(250, 750, 700));
  const faint = await stats(page, band(700));
  expect(faint.maxAlpha).toBeGreaterThan(60);
  expect(faint.maxAlpha).toBeLessThan(100);
  expect(await stats(page, band(rows.pen))).toEqual(penBefore);
});

test("brush preview updates with brush, colour, size and opacity", async ({
  page,
}) => {
  await start(page);
  await page.click("#btn-brush-settings");
  const preview = page.locator(".brush-preview-large");
  const snap = () => preview.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const a = await snap();
  await page.click('.brush-option[data-brush="highlighter"]');
  const b = await snap();
  await page.locator("#thickness-slider").fill("30");
  const c = await snap();
  await page.locator("#opacity-slider").fill("40");
  const d = await snap();
  await page.keyboard.press("Escape");
  await pickColor(page, "#0047ab");
  await page.click("#btn-brush-settings");
  const e = await snap();
  expect(new Set([a, b, c, d, e]).size).toBe(5);
  // Size presets set exact values.
  await page.click('.size-preset:has-text("XL")');
  await expect(page.locator("#thickness-value")).toHaveText("32px");
  await page.click('.size-preset:has-text("XS")');
  await expect(page.locator("#thickness-value")).toHaveText("2px");
});

// ----------------------------------------------------------- history & clear --

test("undo and redo work across draw, erase and clear operations", async ({
  page,
}) => {
  await start(page);
  await setBrush(page, { brush: "pen", size: 10 });
  for (const y of [200, 320, 440]) await drag(page, hline(300, 800, y));
  const all = () => stats(page);
  const three = (await all()).count;

  // Erase through the middle stroke with the eraser tool (one operation).
  await page.click("#tool-eraser");
  await drag(page, [
    [550, 280],
    [550, 320],
    [550, 360],
  ]);
  await expect
    .poll(async () => (await stats(page, band(320))).count)
    .toBeLessThan((await stats(page, band(200))).count);
  const erased = (await all()).count;

  await page.click("#btn-undo"); // erase undone
  await expect.poll(async () => (await all()).count).toBe(three);
  await page.click("#btn-undo"); // third stroke removed
  await expect.poll(async () => (await stats(page, band(440))).count).toBe(0);
  await expect(page.locator("#btn-redo")).toBeEnabled();
  await page.click("#btn-redo");
  await page.click("#btn-redo");
  await expect.poll(async () => (await all()).count).toBe(erased);
  await expect(page.locator("#btn-redo")).toBeDisabled();

  // Clear: cancel keeps the drawing; confirm clears it; undo restores it.
  await page.click("#btn-clear");
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await page.click("#confirm-cancel");
  expect((await all()).count).toBe(erased);
  await page.keyboard.press("Delete");
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await page.click("#confirm-ok");
  await expect.poll(async () => (await all()).count).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await all()).count).toBe(erased);
});

test("camera toggling never clears the drawing", async ({ page }) => {
  await start(page);
  await drag(page, hline(300, 700, 300));
  const before = await stats(page);
  for (let i = 0; i < 3; i++) await page.click("#btn-camera-toggle");
  expect(await stats(page)).toEqual(before);
});

// --------------------------------------------------------------- background --

test("changing the background preserves the drawing; only light backgrounds are offered", async ({
  page,
}) => {
  await start(page);
  await drag(page, hline(300, 700, 300));
  const before = await stats(page);
  await page.click("#btn-background");
  await expect(page.locator(".bg-option")).toHaveCount(5);
  await expect(page.locator('.bg-option[data-bg="plum"]')).toHaveCount(0);
  const expected: Record<string, string> = {
    white: "rgb(255, 255, 255)",
    lavender: "rgb(238, 230, 248)",
    peach: "rgb(249, 231, 223)",
    ivory: "rgb(247, 243, 238)",
  };
  for (const [id, rgb] of Object.entries(expected)) {
    await page.click(`.bg-option[data-bg="${id}"]`);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(document.querySelector("#app")!).backgroundColor,
        ),
      )
      .toBe(rgb);
    expect(await stats(page)).toEqual(before);
  }
  await page.click('.bg-option[data-bg="transparent"]');
  await expect(page.locator("#app")).toHaveClass(/bg-transparent/);
  expect(await stats(page)).toEqual(before);
});

// ------------------------------------------------------------------- shapes --

test("line, rectangle, circle and arrow tools draw real shapes", async ({
  page,
}) => {
  await start(page);
  await setBrush(page, { brush: "pen", size: 6 });
  await page.keyboard.press("r");
  await expect(page.locator("#tool-shapes")).toHaveClass(/active/);
  await drag(page, [
    [200, 150],
    [300, 200],
    [400, 300],
  ]);
  expect((await pixel(page, 300, 150))[3]).toBeGreaterThan(200); // top edge
  expect((await pixel(page, 400, 225))[3]).toBeGreaterThan(200); // right edge
  expect((await pixel(page, 300, 225))[3]).toBe(0); // hollow centre

  await page.keyboard.press("c");
  await drag(page, [
    [650, 250],
    [700, 250],
    [750, 250],
  ]);
  expect((await pixel(page, 650, 150))[3]).toBeGreaterThan(200); // on the circle (r = 100)
  expect((await pixel(page, 650, 250))[3]).toBe(0); // empty centre

  await page.keyboard.press("l");
  await drag(page, [
    [200, 500],
    [300, 520],
    [400, 550],
  ]);
  expect((await pixel(page, 300, 525))[3]).toBeGreaterThan(200);

  await page.keyboard.press("a");
  await drag(page, [
    [600, 500],
    [700, 500],
    [800, 500],
  ]);
  expect((await pixel(page, 700, 500))[3]).toBeGreaterThan(200); // shaft
  expect(
    (await stats(page, { x0: 770, y0: 480, x1: 800, y1: 495 })).count,
  ).toBeGreaterThan(0); // arrow head wing

  // Shapes are undoable like strokes.
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        (await stats(page, { x0: 590, y0: 470, x1: 810, y1: 530 })).count,
    )
    .toBe(0);
});

// -------------------------------------------------------------------- export --

async function decodePng(page: Page, path: string) {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG signature
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const b64 = buf.toString("base64");
  const probe = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const at = (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data);
    return { stroke: at(500, 300), empty: at(1000, 700) };
  }, b64);
  return { width, height, ...probe };
}

test("PNG export contains only the artwork, on the chosen background or transparent", async ({
  page,
}, info) => {
  await start(page);
  await setBrush(page, { brush: "pen", size: 12 });
  await pickColor(page, "#0047ab");
  await drag(page, hline(300, 700, 300));

  await page.click("#btn-artwork");
  let dl = page.waitForEvent("download");
  await page.click("#btn-save");
  let file = await dl;
  expect(file.suggestedFilename()).toMatch(
    /^veyra-artwork-\d{4}-\d{2}-\d{2}-\d{6}\.png$/,
  );
  let path = info.outputPath("ivory.png");
  await file.saveAs(path);
  let png = await decodePng(page, path);
  expect([png.width, png.height]).toEqual([1440, 900]);
  expect(png.stroke).toEqual([0x00, 0x47, 0xab, 255]);
  expect(png.empty).toEqual([0xf7, 0xf3, 0xee, 255]); // ivory, not webcam/UI

  await page.keyboard.press("Escape");
  await page.click("#btn-background");
  await page.click('.bg-option[data-bg="transparent"]');
  await page.keyboard.press("Escape");
  await page.click("#btn-artwork");
  dl = page.waitForEvent("download");
  await page.click("#btn-save");
  file = await dl;
  path = info.outputPath("transparent.png");
  await file.saveAs(path);
  png = await decodePng(page, path);
  expect(png.stroke[3]).toBe(255);
  expect(png.empty[3]).toBe(0); // transparent background
});

// ---------------------------------------------------------- save / restore --

test("artwork can be saved, restored after a reload, and deleted", async ({
  page,
}) => {
  await start(page);
  await drag(page, hline(300, 700, 300));
  await drag(page, hline(300, 700, 420));
  const original = await stats(page);

  await page.click("#btn-artwork");
  await page.fill("#artwork-name", "Morning sketch");
  await page.click("#btn-artwork-save");
  await expect(page.locator("#studio-toast")).toContainText(
    "Saved “Morning sketch”",
  );
  await expect(page.locator(".artwork-item")).toHaveCount(1);
  await expect(page.locator(".artwork-item")).toContainText("2 strokes");

  await page.reload();
  await page.locator("#btn-start").click({ timeout: 60_000 });
  expect((await stats(page)).count).toBe(0);
  await page.click("#btn-artwork");
  await page.click(".artwork-restore");
  // Coordinates are stored at 0.1 px, so anti-aliasing may differ by a few pixels.
  await expect
    .poll(
      async () =>
        Math.abs((await stats(page)).count - original.count) / original.count,
    )
    .toBeLessThan(0.03);
  // Restoring is undoable.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await stats(page)).count).toBe(0);

  await page.click("#btn-artwork");
  await page.click(".artwork-delete");
  await page.click("#confirm-ok");
  await expect(page.locator(".artwork-item")).toHaveCount(0);
  await expect(page.locator("#artwork-empty")).toBeVisible();
});

test("saving reports storage errors instead of failing silently", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.startsWith("veyra:artwork"))
        throw new DOMException("full", "QuotaExceededError");
      return orig.call(this, k, v);
    };
  });
  await start(page);
  await drag(page, hline(300, 700, 300));
  await page.click("#btn-artwork");
  await page.click("#btn-artwork-save");
  await expect(page.locator("#studio-toast")).toContainText(
    "Not enough browser storage",
  );
  await expect(page.locator(".artwork-item")).toHaveCount(0);
});

test("project files export, import, and malformed files are rejected safely", async ({
  page,
}, info) => {
  await start(page);
  await setBrush(page, { brush: "marker", size: 14, opacity: 80 });
  await drag(page, hline(300, 700, 300));
  await page.keyboard.press("r");
  await drag(page, [
    [800, 200],
    [900, 260],
    [1000, 400],
  ]);
  const original = await stats(page);

  await page.click("#btn-artwork");
  const dl = page.waitForEvent("download");
  await page.click("#btn-export-project");
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/\.veyra\.json$/);
  const path = info.outputPath("art.veyra.json");
  await file.saveAs(path);
  const json = JSON.parse(readFileSync(path, "utf8"));
  expect(json.format).toBe("veyra-project");
  expect(json.strokes).toHaveLength(2);
  expect(json.strokes[0]).toMatchObject({ b: "marker", o: 0.8, t: 14 });
  expect(json.strokes[1]).toMatchObject({ s: "rect" });

  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await page.click("#confirm-ok");
  await expect.poll(async () => (await stats(page)).count).toBe(0);

  await page.click("#btn-artwork");
  await page.setInputFiles("#import-file", path);
  await expect
    .poll(
      async () =>
        Math.abs((await stats(page)).count - original.count) / original.count,
    )
    .toBeLessThan(0.03);
  const imported = (await stats(page)).count;

  // Malformed files: an error message, and the current drawing is untouched.
  for (const bad of [
    "{not json",
    JSON.stringify({
      format: "veyra-project",
      version: 1,
      canvas: { width: 10, height: 10 },
      strokes: [{ p: [1, "x"], c: "#000", t: 2, b: "pen" }],
    }),
  ]) {
    await page.setInputFiles("#import-file", {
      name: "bad.veyra.json",
      mimeType: "application/json",
      buffer: Buffer.from(bad),
    });
    await expect(page.locator("#studio-toast")).toContainText(
      "Couldn't open the file",
    );
    expect((await stats(page)).count).toBe(imported);
  }
});

// ------------------------------------------------------------------ keyboard --

test("keyboard shortcuts work and never fire while typing", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.press("e");
  await expect(page.locator("#tool-eraser")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("b");
  await expect(page.locator("#tool-brush")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await drag(page, hline(300, 700, 300));
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await stats(page)).count).toBe(0);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await stats(page)).count).toBeGreaterThan(0);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+Z");
  await expect.poll(async () => (await stats(page)).count).toBeGreaterThan(0);

  // Typing in a text field: letters and Backspace stay in the field.
  await page.click("#btn-artwork");
  await page.click("#artwork-name");
  await page.keyboard.type("Blue eraser");
  await page.keyboard.press("Backspace");
  await expect(page.locator("#artwork-name")).toHaveValue("Blue erase");
  await expect(page.locator("#tool-brush")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#confirm-dialog")).toHaveCount(0);
  // Escape closes the panel.
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel-artwork")).toHaveCount(0);
  await expect(page.locator("#shortcut-list")).toHaveCount(0);
  await page.click("#btn-options");
  await expect(page.locator("#shortcut-list")).toContainText("Undo");
});

// ------------------------------------------------------------- hand pointer --

async function overlayCount(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("#ui-canvas")!;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
    return n;
  });
}

test("the hand-guide pointer can be turned off, is never painted into the artwork, and the setting persists", async ({
  page,
}) => {
  await start(page);
  // A resting fist: the hand is tracked but nothing is drawn.
  const pose: Landmark[] = POSES.fist;
  await page.evaluate(
    (p) => ((window as unknown as { __pose: unknown }).__pose = p),
    pose,
  );
  await expect.poll(() => overlayCount(page)).toBeGreaterThan(200);
  expect((await stats(page)).count).toBe(0); // pointer lives on the overlay only

  await page.click("#btn-options");
  await page.click("#opt-pointer");
  await page.keyboard.press("Escape");
  // With the guide off only the small brush cursor (while drawing) may remain.
  await expect.poll(() => overlayCount(page)).toBeLessThan(200);

  await page.reload();
  await page.locator("#btn-start").click({ timeout: 60_000 });
  await page.click("#btn-options");
  await expect(page.locator("#opt-pointer")).not.toBeChecked();
});

// --------------------------------------------------------------------- mobile --

test.describe("mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test("mobile: brush sliders and colours are usable by touch, panels fit the screen @mobile", async ({
    page,
  }) => {
    await start(page);
    const vp = page.viewportSize()!;
    await page.locator("#btn-brush-settings").tap();
    const panel = (await page.locator("#panel-brush").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(vp.width);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    await page.locator("#thickness-slider").fill("20");
    await expect(page.locator("#thickness-value")).toHaveText("20px");
    await page.locator('.brush-option[data-brush="marker"]').tap();
    await expect(
      page.locator('.brush-option[data-brush="marker"]'),
    ).toHaveAttribute("aria-checked", "true");
    await page.locator(".panel-close").tap();
    await expect(page.locator("#panel-brush")).toHaveCount(0);
    // Touch drawing on the canvas.
    await page.touchscreen.tap(200, 300);
    expect((await stats(page)).count).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(vp.width);
  });
});

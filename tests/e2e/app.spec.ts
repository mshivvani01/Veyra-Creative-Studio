import { expect, test, type Page } from "@playwright/test";

/*
 * Browser tests. The camera is Chrome's file-backed fake capture device
 * (see playwright.config.ts): real video frames go through the real
 * MediaPipe model, but the default feed contains no hand. These tests do
 * NOT prove real-world gesture accuracy with a live webcam.
 */

const IGNORED_CONSOLE = [/gl_context/, /landmark_projection/, /Graph successfully/, /OpenGL error checking/];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(m.text());
  });
  return errors;
}

async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.locator("#btn-start")).toBeVisible({ timeout: 60_000 });
}

async function startDrawing(page: Page) {
  await openApp(page);
  await page.click("#btn-start");
  await expect(page.locator("#onboarding-modal")).toHaveCount(0);
}

test.describe("startup", () => {
  test("shows the loader, then the How to Play modal", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.locator(".loader-subtitle")).toHaveText(/Initializing hand tracking/i);
    await expect(page.locator(".loader-logo")).toBeVisible();
    await expect(page.locator("#btn-start")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".onboarding-title")).toHaveText("How to Play");
    const items = page.locator(".onboarding-item");
    await expect(items).toHaveCount(4);
    for (const [title, text] of [
      ["Draw", "Point index finger to draw"],
      ["Erase", "Sweep open palm to erase"],
      ["Move", "Pinch to grab & reposition"],
      ["Idle", "Close fist to rest"],
    ]) {
      await expect(page.locator(".onboarding-item", { hasText: title })).toContainText(text);
    }
    await expect(page.locator("#loading-screen")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Let's Go! closes the modal and the HUD reports real tracking state", async ({ page }) => {
    const errors = collectErrors(page);
    await startDrawing(page);
    // The synthetic feed has no hand in it, so tracking must NOT claim a gesture.
    await expect(page.locator("#gesture-label")).toHaveText("Show hand");
    await expect(page.locator("#camera-mode-text")).toHaveText("Camera On");
    // The bottom creator credit was removed in Veyra 2.0.
    await expect(page.locator("#creator-handle")).toHaveCount(0);
    const video = await page.evaluate(() => {
      const v = document.querySelector("video")!;
      return { w: v.videoWidth, live: (v.srcObject as MediaStream).getVideoTracks()[0].readyState };
    });
    expect(video.w).toBeGreaterThan(0);
    expect(video.live).toBe("live");
    expect(errors).toEqual([]);
  });
});

test.describe("controls", () => {
  test("thickness and glow sliders update their values", async ({ page }) => {
    await startDrawing(page);
    await page.click("#btn-brush-settings");
    await expect(page.locator("#thickness-value")).toHaveText("6px");
    await expect(page.locator("#glow-value")).toHaveText("60%");
    await page.locator("#thickness-slider").fill("14");
    await page.locator("#glow-slider").fill("25");
    await expect(page.locator("#thickness-value")).toHaveText("14px");
    await expect(page.locator("#glow-value")).toHaveText("25%");
    // Keyboard accessible
    await page.locator("#thickness-slider").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#thickness-value")).toHaveText("15px");
  });

  test("colour swatches select exactly one colour", async ({ page }) => {
    await startDrawing(page);
    await page.click("#btn-color");
    const swatches = page.locator("#color-palette .color-swatch");
    await expect(swatches).toHaveCount(36);
    await expect(page.locator('#color-palette [aria-checked="true"]')).toHaveAttribute("data-color", "#e0654d");
    await page.click('#color-palette [data-color="#8b63d6"]');
    await expect(page.locator('#color-palette [aria-checked="true"]')).toHaveCount(1);
    await expect(page.locator('#color-palette [aria-checked="true"]')).toHaveAttribute("data-color", "#8b63d6");
    await expect(page.locator("#active-color-preview")).toHaveAttribute("title", "Violet");
  });

  test("camera toggle cycles On → Dim → Canvas Only → On (button and pill)", async ({ page }) => {
    await startDrawing(page);
    const text = page.locator("#camera-mode-text");
    const btn = page.locator("#btn-camera-toggle");
    await btn.click();
    await expect(text).toHaveText("Camera Dim");
    await expect(btn).toHaveClass(/active/);
    await btn.click();
    await expect(text).toHaveText("Canvas Only");
    await expect(btn).not.toHaveClass(/active/);
    await expect(page.locator("#camera-mode-indicator")).toHaveClass(/dark-mode/);
    await page.click("#camera-mode-indicator");
    await expect(text).toHaveText("Camera On");
    await expect(btn).toHaveClass(/active/);
  });

  test("camera layer actually renders the feed, and Canvas Only blanks it", async ({ page }) => {
    await startDrawing(page);
    const cameraAlpha = () =>
      page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>("#camera-canvas")!;
        const d = c.getContext("2d")!.getImageData(c.width / 2, c.height / 2, 1, 1).data;
        return d[3];
      });
    await expect.poll(cameraAlpha).toBeGreaterThan(0);
    await page.click("#btn-camera-toggle");
    await page.click("#btn-camera-toggle");
    await expect.poll(cameraAlpha).toBe(0);
  });

  test("undo, clear and save work without errors", async ({ page }) => {
    const errors = collectErrors(page);
    await startDrawing(page);
    // Nothing drawn yet: undo is disabled and clear just says so.
    await expect(page.locator("#btn-undo")).toBeDisabled();
    await page.click("#btn-clear");
    await expect(page.locator("#studio-toast")).toContainText("already empty");
    // Draw with the mouse, then export.
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(500, 360, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator("#btn-undo")).toBeEnabled();
    await page.click("#btn-artwork");
    const download = page.waitForEvent("download");
    await page.click("#btn-save");
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^veyra-artwork-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
    expect(errors).toEqual([]);
  });

  test("buttons have accessible names and are keyboard focusable", async ({ page }) => {
    await startDrawing(page);
    for (const name of [
      "Brush (B)",
      "Eraser (E)",
      "Shapes",
      "Brush settings",
      "Canvas background",
      "Toggle camera view",
      "Save, open & export",
      "Options & shortcuts",
      "Clear canvas (Delete)",
    ]) {
      const b = page.getByRole("button", { name });
      await expect(b).toBeVisible();
      await b.focus();
      await expect(b).toBeFocused();
    }
    // Undo/Redo are named but disabled (not focusable) until there is history.
    for (const name of ["Undo (Ctrl+Z)", "Redo (Ctrl+Y)"]) {
      await expect(page.getByRole("button", { name })).toBeDisabled();
    }
  });
});

test.describe("error handling (mocked browser APIs)", () => {
  test("permission denied shows the reference's error message", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    });
    await page.goto("/");
    await expect(page.locator(".loader-subtitle")).toHaveText(
      "Error: Camera access required. Please allow camera permissions and reload.",
    );
    await expect(page.locator(".loader-bar")).toHaveCount(0);
    await expect(page.locator("#btn-start")).toHaveCount(0);
  });

  test("no camera available", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("none", "NotFoundError"));
    });
    await page.goto("/");
    await expect(page.locator(".loader-subtitle")).toHaveText(/No camera found/);
  });

  test("unsupported browser (no mediaDevices)", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    });
    await page.goto("/");
    await expect(page.locator(".loader-subtitle")).toHaveText(/does not support camera access/);
  });

  test("model / WASM download failure", async ({ page }) => {
    await page.route(/\.task$|vision_wasm_internal|mediapipe/, (route) => route.abort());
    await page.goto("/");
    await expect(page.locator(".loader-subtitle")).toHaveText(/Hand-tracking model failed to load/, {
      timeout: 60_000,
    });
  });

  test("camera disconnect mid-session shows a notice and can reconnect", async ({ page }) => {
    await startDrawing(page);
    await page.evaluate(() => {
      const track = (document.querySelector("video")!.srcObject as MediaStream).getVideoTracks()[0];
      track.stop();
      track.dispatchEvent(new Event("ended"));
    });
    await expect(page.locator("#error-notice")).toContainText("Camera disconnected");
    await expect(page.locator("#gesture-label")).toHaveText("Show hand");
    await page.getByRole("button", { name: "Reconnect" }).click();
    await expect(page.locator("#error-notice")).toHaveCount(0);
    const live = await page.evaluate(
      () => (document.querySelector("video")!.srcObject as MediaStream).getVideoTracks()[0].readyState,
    );
    expect(live).toBe("live");
  });
});

test.describe("mobile layout @mobile", () => {
  test("toolbar docks to the bottom and the palette opens as a sheet @mobile", async ({ page }) => {
    await startDrawing(page);
    const vp = page.viewportSize()!;
    const bar = await page.locator("#toolbar").boundingBox();
    expect(bar).not.toBeNull();
    expect(Math.round(bar!.y + bar!.height)).toBe(vp.height);
    expect(Math.round(bar!.width)).toBe(vp.width);
    await expect(page.locator("#color-palette")).toHaveCount(0);
    await page.locator("#btn-color").tap();
    const sheet = await page.locator("#panel-color").boundingBox();
    expect(sheet!.x).toBeGreaterThanOrEqual(0);
    expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(vp.width);
    expect(sheet!.y).toBeGreaterThanOrEqual(0);
    await page.locator('#color-palette [data-color="#87a878"]').tap();
    await expect(page.locator("#active-color-preview")).toHaveAttribute("title", "Sage");
    // Outside tap closes the sheet.
    await page.mouse.click(vp.width / 2, 120);
    await expect(page.locator("#panel-color")).toHaveCount(0);
    // Every rail button is reachable by scrolling the bar.
    await page.locator("#btn-clear").scrollIntoViewIfNeeded();
    await expect(page.locator("#btn-clear")).toBeInViewport();
    // No creator credit, no horizontal page overflow.
    await expect(page.locator("#creator-handle")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
  });
});

test.describe("real hand image (optional)", () => {
  test.skip(!process.env.HAND_Y4M, "Set HAND_Y4M to a .y4m video containing a hand to run this test.");
  test("detects a hand from the camera feed", async ({ page }) => {
    await startDrawing(page);
    await expect(page.locator("#gesture-label")).not.toHaveText("Show hand", { timeout: 30_000 });
  });
});

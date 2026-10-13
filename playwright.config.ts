import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
// A synthetic camera feed (flat grey frames) — real frames flow through the
// real MediaPipe model, but there is no hand in them. Set HAND_Y4M to a .y4m
// video of a hand to run the optional real-hand detection test.
const cameraFile = process.env.HAND_Y4M ?? join(root, "tests/e2e/fixtures/blank-camera.y4m");

const cameraArgs = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-video-capture=${cameraFile}`,
];

// PW_CHANNEL=chrome (or msedge) runs against an installed browser instead of
// Playwright's bundled Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    permissions: ["camera"],
    launchOptions: { args: cameraArgs },
    channel,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel }, grepInvert: /@mobile/ },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, channel },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

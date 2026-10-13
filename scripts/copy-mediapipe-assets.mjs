// Copies the MediaPipe Tasks Vision WASM runtime from node_modules into
// public/ so the app can load it from its own origin (no CDN required).
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.error(`[assets] MediaPipe WASM not found at ${src}. Run "npm install" first.`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const file of readdirSync(src)) {
  cpSync(join(src, file), join(dest, file));
}
console.log(`[assets] Copied MediaPipe WASM (${readdirSync(dest).length} files) to public/mediapipe/wasm`);

const model = join(root, "public", "models", "hand_landmarker.task");
if (!existsSync(model)) {
  console.warn(
    "[assets] public/models/hand_landmarker.task is missing; the app will fall back to the Google-hosted model.",
  );
}

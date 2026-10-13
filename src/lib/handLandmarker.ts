import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { InitError } from "./errors";

/**
 * Asset locations. Local copies (served from /public) are tried first so the
 * app works without third-party requests; the CDN/Google-hosted copies used
 * by the reference app are kept as fallbacks.
 */
export const MEDIAPIPE_VERSION = "0.10.18";
const BASE = import.meta.env.BASE_URL;

export const WASM_SOURCES = [
  `${BASE}mediapipe/wasm`,
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
];

export const MODEL_SOURCES = [
  `${BASE}models/hand_landmarker.task`,
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
];

const OPTIONS = {
  runningMode: "VIDEO" as const,
  numHands: 1,
  minHandDetectionConfidence: 0.6,
  minHandPresenceConfidence: 0.6,
  minTrackingConfidence: 0.5,
};

async function urlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Creates a HandLandmarker, trying local then remote assets and the GPU
 * delegate before falling back to CPU. Throws InitError("model") if every
 * combination fails.
 */
export async function createHandLandmarker(): Promise<HandLandmarker> {
  const errors: unknown[] = [];
  for (const wasm of WASM_SOURCES) {
    if (wasm.startsWith("/") || wasm.startsWith(".")) {
      if (!(await urlReachable(`${wasm}/vision_wasm_internal.wasm`))) {
        errors.push(new Error(`WASM not found at ${wasm}`));
        continue;
      }
    }
    let fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(wasm);
    } catch (e) {
      errors.push(e);
      continue;
    }
    for (const model of MODEL_SOURCES) {
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          const lm = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: model, delegate },
            ...OPTIONS,
          });
          if (import.meta.env.DEV) {
            console.info(`[veyra] HandLandmarker ready (wasm=${wasm}, model=${model}, delegate=${delegate})`);
          }
          return lm;
        } catch (e) {
          errors.push(e);
          if (import.meta.env.DEV) console.warn(`[veyra] HandLandmarker init failed (${model}, ${delegate})`, e);
        }
      }
    }
  }
  console.error("[veyra] Could not initialise hand tracking", errors);
  throw new InitError("model", errors);
}

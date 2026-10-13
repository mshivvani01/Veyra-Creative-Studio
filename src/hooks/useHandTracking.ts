import { useCallback, useEffect, useRef } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker } from "../lib/handLandmarker";

/**
 * Loads the MediaPipe HandLandmarker once and closes it on unmount.
 * load() is idempotent: repeated calls share the same in-flight promise.
 */
export function useHandTracking() {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const pending = useRef<Promise<HandLandmarker> | null>(null);
  const disposed = useRef(false);

  const load = useCallback(async (): Promise<HandLandmarker> => {
    if (landmarkerRef.current) return landmarkerRef.current;
    if (!pending.current) {
      // Test seam: browser tests can inject a scripted landmarker to drive the
      // real render loop with synthetic hand poses. Never set in normal use.
      const injected = (window as unknown as { __AIR_DRAW_TEST_LANDMARKER__?: HandLandmarker })
        .__AIR_DRAW_TEST_LANDMARKER__;
      pending.current = (injected ? Promise.resolve(injected) : createHandLandmarker())
        .then((lm) => {
          if (disposed.current) {
            lm.close();
            throw new Error("HandLandmarker loaded after unmount");
          }
          landmarkerRef.current = lm;
          return lm;
        })
        .finally(() => {
          pending.current = null;
        });
    }
    return pending.current;
  }, []);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      try {
        landmarkerRef.current?.close();
      } catch {
        /* already closed */
      }
      landmarkerRef.current = null;
    };
  }, []);

  return { load, landmarkerRef };
}

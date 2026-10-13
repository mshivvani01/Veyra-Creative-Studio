import { useCallback, useEffect, useRef, type RefObject } from "react";
import { InitError, cameraErrorKind } from "../lib/errors";

export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};

/**
 * Owns the webcam MediaStream lifecycle for a <video> element.
 *
 * - start() requests the camera, attaches it to the video and resolves once
 *   frames are playing. Concurrent/repeated calls are safe: a superseded
 *   request stops its own stream so no duplicate streams survive.
 * - stop() stops every track and detaches the video.
 * - Tracks are stopped on unmount and on page hide/unload.
 */
export function useCamera(videoRef: RefObject<HTMLVideoElement>) {
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const endedHandler = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    generation.current++;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        if (endedHandler.current) track.removeEventListener("ended", endedHandler.current);
        track.stop();
      }
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, [videoRef]);

  const start = useCallback(
    async (onEnded?: () => void): Promise<void> => {
      if (!window.isSecureContext) throw new InitError("insecure");
      if (!navigator.mediaDevices?.getUserMedia) throw new InitError("unsupported");

      stop();
      const myGen = ++generation.current;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
      } catch (err) {
        throw new InitError(cameraErrorKind(err), err);
      }

      if (myGen !== generation.current) {
        // A newer start()/stop() happened while we were waiting for permission.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      endedHandler.current = onEnded ?? null;
      if (onEnded) stream.getVideoTracks().forEach((t) => t.addEventListener("ended", onEnded));

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          const ok = () => {
            cleanup();
            resolve();
          };
          const fail = () => {
            cleanup();
            reject(new InitError("noCamera"));
          };
          const cleanup = () => {
            video.removeEventListener("loadedmetadata", ok);
            video.removeEventListener("error", fail);
          };
          video.addEventListener("loadedmetadata", ok);
          video.addEventListener("error", fail);
        });
      }
      try {
        await video.play();
      } catch (err) {
        // Autoplay of a muted, inline video should never be blocked; if it is,
        // surface it rather than silently showing a frozen camera.
        if ((err as { name?: string }).name !== "AbortError") throw new InitError("unknown", err);
      }
    },
    [stop, videoRef],
  );

  useEffect(() => {
    const onHide = () => stop();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      stop();
    };
  }, [stop]);

  return { start, stop, streamRef };
}

import type { RefObject } from "react";

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
}

/**
 * The raw <video> is hidden (it only feeds MediaPipe); the visible camera
 * image is painted mirrored and semi-transparent onto #camera-canvas.
 */
export function CameraPreview({ videoRef, canvasRef }: Props) {
  return (
    <>
      <video id="webcam" ref={videoRef} autoPlay playsInline muted />
      <canvas id="camera-canvas" ref={canvasRef} aria-hidden="true" />
    </>
  );
}

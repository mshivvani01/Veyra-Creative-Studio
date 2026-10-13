import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { CameraMode, FrameSize, Gesture, HandLandmarks, Point, Viewport } from "../types";
import type { AirDrawSession, FrameOutput } from "../lib/airDrawSession";
import { coverRect } from "../lib/handCoordinates";
import {
  OVERLAY,
  drawBrushCursor,
  drawEraserRing,
  drawGrabIndicator,
  drawHandSkeleton,
  drawPointer,
  renderDrawing,
  renderStroke,
  spawnParticles,
  stepParticles,
  type Particle,
} from "../lib/drawingEngine";
import { sounds } from "../lib/sound";

export const CAMERA_OPACITY: Record<CameraMode, number> = { on: 0.35, dim: 0.15, dark: 0 };
const MAX_DPR = 2;
/** Consecutive inference failures tolerated before reporting tracking as broken. */
const MAX_INFERENCE_ERRORS = 30;

/** Settings the loop reads every frame (kept in a ref so changing them never re-renders React). */
export interface LoopSettings {
  /** Show the hand skeleton and fingertip pointer overlay. */
  showPointer: boolean;
}

export interface LoopRefs {
  video: RefObject<HTMLVideoElement>;
  cameraCanvas: RefObject<HTMLCanvasElement>;
  drawingCanvas: RefObject<HTMLCanvasElement>;
  uiCanvas: RefObject<HTMLCanvasElement>;
  landmarker: MutableRefObject<HandLandmarker | null>;
  session: MutableRefObject<AirDrawSession>;
  cameraMode: MutableRefObject<CameraMode>;
  /** Set to true from outside (pointer input/resize) to force a drawing re-render. */
  dirty: MutableRefObject<boolean>;
  particles: MutableRefObject<Particle[]>;
  settings: MutableRefObject<LoopSettings>;
  /** Mouse/touch position over the canvas (for the eraser ring), or null. */
  pointer: MutableRefObject<Point | null>;
}

export interface LoopCallbacks {
  onGestureChange: (gesture: Gesture) => void;
  onTrackingError: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Resizes a canvas for the current viewport at device pixel ratio and returns its 2D context. */
function fitCanvas(canvas: HTMLCanvasElement, vp: Viewport, dpr: number): CanvasRenderingContext2D | null {
  const w = Math.round(vp.width * dpr);
  const h = Math.round(vp.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function playTransitionSound(prev: Gesture, next: Gesture): void {
  if (next === "index_finger") sounds.drawStart();
  else if (next === "open_palm") sounds.toggle();
  else if (next === "pinch") sounds.grab();
  else if (prev === "index_finger") sounds.drawEnd();
}

/**
 * Runs the requestAnimationFrame loop: draws the mirrored camera frame,
 * runs hand-landmark inference once per new video frame, feeds the result
 * into the AirDrawSession and renders the drawing + overlay layers.
 *
 * Committed strokes are cached on an offscreen canvas and re-rendered only
 * when the session's version changes, so per-frame cost while drawing is one
 * bitmap blit plus the stroke in progress.
 */
export function useAirDrawLoop(enabled: boolean, refs: LoopRefs, callbacks: LoopCallbacks): void {
  const cb = useRef(callbacks);
  cb.current = callbacks;

  useEffect(() => {
    if (!enabled) return;
    const { video, cameraCanvas, drawingCanvas, uiCanvas } = refs;
    let raf = 0;
    let stopped = false;
    let lastVideoTime = -1;
    let errorCount = 0;
    let reported = false;
    let lastLandmarks: HandLandmarks | null = null;
    let lastOut: FrameOutput | null = null;
    let committedVersion = -1;
    const reducedMotion = prefersReducedMotion();
    const committed = document.createElement("canvas");

    let viewport: Viewport = { width: window.innerWidth, height: window.innerHeight };
    let ctxs: {
      cam: CanvasRenderingContext2D;
      draw: CanvasRenderingContext2D;
      ui: CanvasRenderingContext2D;
      off: CanvasRenderingContext2D;
    } | null = null;

    const resize = () => {
      viewport = { width: window.innerWidth, height: window.innerHeight };
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cam = cameraCanvas.current && fitCanvas(cameraCanvas.current, viewport, dpr);
      const draw = drawingCanvas.current && fitCanvas(drawingCanvas.current, viewport, dpr);
      const ui = uiCanvas.current && fitCanvas(uiCanvas.current, viewport, dpr);
      const off = fitCanvas(committed, viewport, dpr);
      ctxs = cam && draw && ui && off ? { cam, draw, ui, off } : null;
      // Strokes are stored in CSS pixels, so a resize simply re-renders them.
      committedVersion = -1;
      refs.dirty.current = true;
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (!ctxs) return;
      const { cam, draw, ui, off } = ctxs;
      const v = video.current;
      const session = refs.session.current;
      const settings = refs.settings.current;
      const palette = OVERLAY;
      const hasFrame = !!v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.videoWidth > 0;
      const frame: FrameSize | null = hasFrame ? { width: v!.videoWidth, height: v!.videoHeight } : null;

      // 1. Camera layer (mirrored, object-fit: cover).
      cam.clearRect(0, 0, viewport.width, viewport.height);
      const opacity = CAMERA_OPACITY[refs.cameraMode.current];
      if (hasFrame && frame && opacity > 0) {
        const r = coverRect(frame, viewport);
        cam.save();
        cam.globalAlpha = opacity;
        cam.translate(viewport.width, 0);
        cam.scale(-1, 1);
        cam.drawImage(v!, r.offsetX, r.offsetY, r.drawW, r.drawH);
        cam.restore();
      }

      // No frames (camera stopped/disconnected): never leave a stale hand on screen.
      if (!hasFrame) {
        lastLandmarks = null;
        lastOut = null;
      }

      // 2. Inference — only once per new video frame.
      const landmarker = refs.landmarker.current;
      if (hasFrame && landmarker && v!.currentTime !== lastVideoTime) {
        lastVideoTime = v!.currentTime;
        let result: HandLandmarkerResult | null = null;
        try {
          result = landmarker.detectForVideo(v!, now);
          errorCount = 0;
        } catch (err) {
          errorCount++;
          if (import.meta.env.DEV) console.warn("[veyra] detectForVideo failed", err);
          if (errorCount >= MAX_INFERENCE_ERRORS && !reported) {
            reported = true;
            cb.current.onTrackingError();
          }
        }
        if (result) {
          const lm = result.landmarks?.[0] ?? null;
          const confidence = result.handedness?.[0]?.[0]?.score;
          const out = session.update({ landmarks: lm, confidence, viewport, frame, now });
          if (out.changed) {
            playTransitionSound(out.previous, out.gesture);
            cb.current.onGestureChange(out.gesture);
          }
          if (out.dropped) sounds.drop();
          if (out.erasedSomething) sounds.erase();
          if (out.addedPoint && !reducedMotion) {
            spawnParticles(refs.particles.current, out.addedPoint, session.brush.color);
          }
          if (out.dirty) refs.dirty.current = true;
          lastLandmarks = lm;
          lastOut = out;
        }
      }

      // 3. Drawing layer: cached committed strokes + the stroke in progress.
      if (refs.dirty.current || session.version !== committedVersion) {
        refs.dirty.current = false;
        if (session.version !== committedVersion) {
          renderDrawing(off, viewport, session.strokes, null);
          committedVersion = session.version;
        }
        draw.clearRect(0, 0, viewport.width, viewport.height);
        draw.drawImage(committed, 0, 0, viewport.width, viewport.height);
        if (session.currentStroke) renderStroke(draw, session.currentStroke);
      }

      // 4. Overlay layer (hand guide, tool cursors, particles) — every frame.
      ui.clearRect(0, 0, viewport.width, viewport.height);
      if (lastOut && lastLandmarks) {
        if (lastOut.eraser) drawEraserRing(ui, lastOut.eraser, lastOut.eraserRadius, palette);
        if (lastOut.grabPoint) drawGrabIndicator(ui, lastOut.grabPoint, lastOut.grabTarget, palette);
        if (settings.showPointer) {
          drawHandSkeleton(ui, lastLandmarks, viewport, frame, palette);
          if (lastOut.fingertip && !lastOut.cursor && !lastOut.eraser) drawPointer(ui, lastOut.fingertip, palette);
        }
        if (lastOut.cursor) drawBrushCursor(ui, lastOut.cursor, session.brush.color, session.brush.thickness);
      }
      const mouse = refs.pointer.current;
      if (mouse && session.tool === "eraser") drawEraserRing(ui, mouse, session.brush.eraserSize, palette);
      stepParticles(ui, refs.particles.current);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // refs are stable MutableRefObjects; the loop reads .current each frame.
  }, [enabled]);
}

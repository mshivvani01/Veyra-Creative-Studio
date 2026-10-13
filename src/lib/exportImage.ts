import type { Stroke, Viewport } from "../types";
import { renderDrawing } from "./drawingEngine";

const pad = (n: number) => String(n).padStart(2, "0");

/** e.g. "veyra-artwork-2026-10-13-153012.png" (local time). */
export function exportFilename(date = new Date(), ext = "png"): string {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `veyra-artwork-${d}-${t}.${ext}`;
}

/**
 * Renders the artwork alone (no webcam, overlay or UI) onto a fresh canvas.
 * `background` null = transparent PNG.
 */
export function renderArtwork(
  strokes: readonly Stroke[],
  viewport: Viewport,
  background: string | null,
  scale = 1,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width * scale));
  canvas.height = Math.max(1, Math.round(viewport.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  renderDrawing(ctx, viewport, strokes, null);
  if (background) {
    // Paint the background *behind* the strokes.
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.restore();
  }
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image"))), type);
  });
}

/** Triggers a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

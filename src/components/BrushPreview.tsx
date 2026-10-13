import { useEffect, useRef } from "react";
import type { BrushType, Point, ShapeKind, Stroke } from "../types";
import { renderStroke } from "../lib/drawingEngine";

interface Props {
  brush: BrushType | "eraser";
  color: string;
  thickness: number;
  opacity: number;
  glow: number;
  eraserSize?: number;
  shape?: ShapeKind;
  width: number;
  height: number;
  /** CSS background behind the sample (null = transparent). */
  background?: string | null;
  className?: string;
  label?: string;
}

/** Sample S-curve across the preview box. */
function sampleCurve(w: number, h: number): Point[] {
  const pts: Point[] = [];
  const pad = Math.min(w, h) * 0.22;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push({ x: pad + t * (w - pad * 2), y: h / 2 + Math.sin(t * Math.PI * 2) * (h / 2 - pad) * 0.8 });
  }
  return pts;
}

/**
 * Live brush preview rendered with the real stroke renderer, so what you
 * see here is exactly what the next stroke will look like.
 */
export function BrushPreview(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(p.width * dpr);
    canvas.height = Math.round(p.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, p.width, p.height);
    if (p.background) {
      ctx.fillStyle = p.background;
      ctx.fillRect(0, 0, p.width, p.height);
    }
    if (p.brush === "eraser") {
      const r = Math.min(p.height / 2 - 3, Math.max(3, (p.eraserSize ?? 28) * (p.height / 120)));
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#b8434d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.width / 2, p.height / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    // Keep big brushes readable inside small previews.
    const maxT = p.height * 0.35;
    const stroke: Stroke = {
      points: p.shape
        ? [
            { x: p.width * 0.28, y: p.height * 0.3 },
            { x: p.width * 0.72, y: p.height * 0.72 },
          ]
        : sampleCurve(p.width, p.height),
      color: p.color,
      thickness: Math.min(p.thickness, maxT),
      glow: p.glow,
      brush: p.brush,
      opacity: p.opacity,
      ...(p.shape ? { shape: p.shape } : {}),
    };
    renderStroke(ctx, stroke);
  }, [p.brush, p.color, p.thickness, p.opacity, p.glow, p.eraserSize, p.shape, p.width, p.height, p.background]);

  return (
    <canvas
      ref={ref}
      className={p.className}
      style={{ width: p.width, height: p.height }}
      role={p.label ? "img" : undefined}
      aria-label={p.label}
      aria-hidden={p.label ? undefined : true}
    />
  );
}

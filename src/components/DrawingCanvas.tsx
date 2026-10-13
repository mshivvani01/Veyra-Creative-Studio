import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

type Handler = (e: ReactPointerEvent<HTMLCanvasElement>) => void;

interface Props {
  drawingRef: RefObject<HTMLCanvasElement>;
  uiRef: RefObject<HTMLCanvasElement>;
  /** CSS cursor class for the active tool. */
  toolClass: string;
  onPointerDown: Handler;
  onPointerMove: Handler;
  onPointerUp: Handler;
  onPointerLeave: Handler;
}

/**
 * Stroke layer (also receives mouse/touch drawing) plus the overlay layer
 * (hand guide, cursors, particles), which never takes input.
 */
export function DrawingCanvas({ drawingRef, uiRef, toolClass, onPointerDown, onPointerMove, onPointerUp, onPointerLeave }: Props) {
  return (
    <>
      <canvas
        id="drawing-canvas"
        ref={drawingRef}
        className={toolClass}
        role="img"
        aria-label="Veyra drawing canvas. Draw with your index finger, a mouse or touch."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
      <canvas id="ui-canvas" ref={uiRef} aria-hidden="true" />
    </>
  );
}

import { useEffect, useRef, type CSSProperties } from "react";
import { BACKGROUNDS, SHAPE_TOOLS } from "../lib/constants";
import { SHORTCUT_HELP } from "../lib/shortcuts";
import type { BackgroundId, ShapeKind, Tool } from "../types";
import { LineIcon } from "./Icons";
import { Panel } from "./Panel";

// ------------------------------------------------------------------ shapes --

export function ShapesPanel({
  tool,
  onTool,
  onClose,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  onClose: () => void;
}) {
  return (
    <Panel id="shapes" title="Shapes" onClose={onClose}>
      <div className="shape-grid" role="radiogroup" aria-label="Shape tool">
        {SHAPE_TOOLS.map((s) => {
          const active = tool === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`shape-option${active ? " active" : ""}`}
              data-shape={s.id}
              onClick={() => onTool(s.id)}
            >
              <LineIcon name={s.id as ShapeKind} size={22} />
              <span>{s.label}</span>
              <kbd>{s.key}</kbd>
            </button>
          );
        })}
      </div>
      <p className="panel-hint">
        Drag with a mouse or finger on the canvas. Or point with your index finger: the shape follows your fingertip and is
        placed when you stop pointing. Shapes use the current colour, size, brush and opacity.
      </p>
    </Panel>
  );
}

// -------------------------------------------------------------- background --

export function BackgroundPanel({
  background,
  onBackground,
  onClose,
}: {
  background: BackgroundId;
  onBackground: (b: BackgroundId) => void;
  onClose: () => void;
}) {
  return (
    <Panel id="background" title="Canvas background" onClose={onClose}>
      <div className="bg-grid" role="radiogroup" aria-label="Canvas background">
        {BACKGROUNDS.map((b) => {
          const active = background === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`bg-option${active ? " active" : ""}`}
              data-bg={b.id}
              onClick={() => onBackground(b.id)}
            >
              <span
                className={`bg-chip${b.color ? "" : " checker"}`}
                style={b.color ? ({ background: b.color } as CSSProperties) : undefined}
                aria-hidden="true"
              />
              <span>{b.label}</span>
            </button>
          );
        })}
      </div>
      <p className="panel-hint">
        The background sits behind your drawing, so changing it never alters strokes. Transparent exports a PNG with an
        alpha channel.
      </p>
    </Panel>
  );
}

// ----------------------------------------------------------------- options --

export function OptionsPanel({
  showPointer,
  smoothing,
  sound,
  onShowPointer,
  onSmoothing,
  onSound,
  onClose,
}: {
  showPointer: boolean;
  smoothing: number;
  sound: boolean;
  onShowPointer: (v: boolean) => void;
  onSmoothing: (v: number) => void;
  onSound: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Panel id="options" title="Options" onClose={onClose}>
      <label className="switch-row">
        <span>
          <strong>Hand guide</strong>
          <small>Skeleton and fingertip pointer (never drawn into your artwork)</small>
        </span>
        <input
          type="checkbox"
          id="opt-pointer"
          role="switch"
          checked={showPointer}
          onChange={(e) => onShowPointer(e.target.checked)}
        />
      </label>
      <label className="switch-row">
        <span>
          <strong>Sound effects</strong>
          <small>Soft tones on gestures and actions</small>
        </span>
        <input type="checkbox" id="opt-sound" role="switch" checked={sound} onChange={(e) => onSound(e.target.checked)} />
      </label>

      <div className="panel-section">
        <div className="slider-row">
          <label className="panel-label" htmlFor="smoothing-slider">
            Pointer smoothing
          </label>
          <span id="smoothing-value" className="slider-readout">
            {smoothing}%
          </span>
        </div>
        <input
          type="range"
          id="smoothing-slider"
          className="h-slider"
          min={0}
          max={100}
          value={smoothing}
          aria-describedby="smoothing-hint"
          onChange={(e) => onSmoothing(parseInt(e.target.value, 10))}
        />
        <p id="smoothing-hint" className="panel-hint">
          Higher = steadier hand-drawn lines; lower = more responsive.
        </p>
      </div>

      <div className="panel-section">
        <span className="panel-label">Keyboard shortcuts</span>
        <dl className="shortcut-list" id="shortcut-list">
          {SHORTCUT_HELP.map((s) => (
            <div key={s.keys}>
              <dt>{s.action}</dt>
              <dd>
                <kbd>{s.keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ confirmation --

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function ConfirmDialog({ request, onCancel }: { request: ConfirmRequest; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Safer default: focus Cancel for destructive actions.
    cancelRef.current?.focus();
  }, []);
  return (
    <div className="confirm-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        id="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <h2 id="confirm-title">{request.title}</h2>
        <p id="confirm-message">{request.message}</p>
        <div className="confirm-actions">
          <button type="button" id="confirm-cancel" className="btn-secondary" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            id="confirm-ok"
            className="btn-danger"
            onClick={() => {
              request.onConfirm();
              onCancel();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ toast --

export interface ToastMessage {
  id: number;
  text: string;
  tone: "info" | "error";
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  return (
    <div id="studio-toast" className={toast ? `toast ${toast.tone}` : "toast"} role="status" aria-live="polite">
      {toast?.text ?? ""}
    </div>
  );
}

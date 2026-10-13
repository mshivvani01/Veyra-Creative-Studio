import { BRUSHES, DEFAULTS, SIZE_PRESETS } from "../lib/constants";
import type { BrushType, Tool } from "../types";
import { BrushPreview } from "./BrushPreview";
import { Panel } from "./Panel";

export interface BrushState {
  color: string;
  thickness: number;
  glow: number;
  brush: BrushType;
  /** 0.05..1 */
  opacity: number;
  eraserSize: number;
}

interface Props {
  state: BrushState;
  tool: Tool;
  background: string | null;
  onBrush: (b: BrushType) => void;
  onEraser: () => void;
  onChange: (patch: Partial<BrushState>) => void;
  onClose: () => void;
}

/** Brush presets, size (with quick presets), opacity, glow and eraser size. */
export function BrushPanel({ state, tool, background, onBrush, onEraser, onChange, onClose }: Props) {
  const erasing = tool === "eraser";
  const opacityPct = Math.round(state.opacity * 100);
  const glowEnabled = state.brush === "neon";

  return (
    <Panel id="brush" title="Brush" onClose={onClose}>
      <BrushPreview
        className="brush-preview-large"
        brush={erasing ? "eraser" : state.brush}
        color={state.color}
        thickness={state.thickness}
        opacity={state.opacity}
        glow={state.glow}
        eraserSize={state.eraserSize}
        width={268}
        height={72}
        background={background}
        label="Current brush preview"
      />

      <div className="brush-grid" role="radiogroup" aria-label="Brush type">
        {BRUSHES.map((b) => {
          const active = !erasing && tool === "brush" && state.brush === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`brush-option${active ? " active" : ""}`}
              data-brush={b.id}
              title={b.hint}
              onClick={() => onBrush(b.id)}
            >
              <BrushPreview
                brush={b.id}
                color={state.color}
                thickness={Math.min(state.thickness, 10)}
                opacity={state.opacity}
                glow={state.glow}
                width={72}
                height={30}
              />
              <span>{b.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={erasing}
          className={`brush-option${erasing ? " active" : ""}`}
          data-brush="eraser"
          title="Removes drawing where you erase"
          onClick={onEraser}
        >
          <BrushPreview
            brush="eraser"
            color={state.color}
            thickness={state.thickness}
            opacity={1}
            glow={0}
            eraserSize={state.eraserSize}
            width={72}
            height={30}
          />
          <span>Eraser</span>
        </button>
      </div>

      <div className="panel-section">
        <div className="slider-row">
          <label className="panel-label" htmlFor="thickness-slider">
            Size
          </label>
          <span id="thickness-value" className="slider-readout">
            {state.thickness}px
          </span>
        </div>
        <input
          type="range"
          id="thickness-slider"
          className="h-slider"
          min={DEFAULTS.thicknessMin}
          max={DEFAULTS.thicknessMax}
          value={state.thickness}
          aria-valuetext={`${state.thickness} pixels`}
          onChange={(e) => onChange({ thickness: parseInt(e.target.value, 10) })}
        />
        <div className="preset-row" role="group" aria-label="Size presets">
          {SIZE_PRESETS.map((s) => (
            <button
              key={s.label}
              type="button"
              className={`size-preset${state.thickness === s.value ? " active" : ""}`}
              aria-pressed={state.thickness === s.value}
              aria-label={`${s.label}, ${s.value} pixels`}
              onClick={() => onChange({ thickness: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="slider-row">
          <label className="panel-label" htmlFor="opacity-slider">
            Opacity
          </label>
          <span id="opacity-value" className="slider-readout">
            {opacityPct}%
          </span>
        </div>
        <input
          type="range"
          id="opacity-slider"
          className="h-slider"
          min={DEFAULTS.opacityMinPct}
          max={100}
          value={opacityPct}
          aria-valuetext={`${opacityPct} percent`}
          onChange={(e) => onChange({ opacity: parseInt(e.target.value, 10) / 100 })}
        />
      </div>

      <div className="panel-section">
        <div className="slider-row">
          <label className="panel-label" htmlFor="glow-slider">
            Glow
          </label>
          <span id="glow-value" className="slider-readout">
            {state.glow}%
          </span>
        </div>
        <input
          type="range"
          id="glow-slider"
          className="h-slider"
          min={DEFAULTS.glowMin}
          max={DEFAULTS.glowMax}
          value={state.glow}
          disabled={!glowEnabled}
          aria-describedby="glow-hint"
          aria-valuetext={`${state.glow} percent`}
          onChange={(e) => onChange({ glow: parseInt(e.target.value, 10) })}
        />
        <p id="glow-hint" className="panel-hint">
          {glowEnabled ? "Glow intensity of the neon brush." : "Glow applies to the Neon brush."}
        </p>
      </div>

      <div className="panel-section">
        <div className="slider-row">
          <label className="panel-label" htmlFor="eraser-slider">
            Eraser size
          </label>
          <span id="eraser-value" className="slider-readout">
            {state.eraserSize}px
          </span>
        </div>
        <input
          type="range"
          id="eraser-slider"
          className="h-slider"
          min={DEFAULTS.eraserMin}
          max={DEFAULTS.eraserMax}
          value={state.eraserSize}
          aria-describedby="eraser-hint"
          aria-valuetext={`${state.eraserSize} pixels`}
          onChange={(e) => onChange({ eraserSize: parseInt(e.target.value, 10) })}
        />
        <p id="eraser-hint" className="panel-hint">
          Radius for the eraser tool and the open-palm gesture.
        </p>
      </div>
    </Panel>
  );
}

import { useState, type CSSProperties } from "react";
import { PALETTE, colorName, normalizeHex } from "../lib/colors";
import { LineIcon } from "./Icons";
import { Panel } from "./Panel";

interface Props {
  color: string;
  recent: string[];
  /** `remember` = add to recent colours (false while dragging the native picker). */
  onColor: (hex: string, remember?: boolean) => void;
  onClose: () => void;
}

const swatchStyle = (c: string) => ({ "--swatch-color": c }) as CSSProperties;

/** Colour studio: current colour, custom hex/picker, recent colours and the curated palette. */
export function ColorPanel({ color, recent, onColor, onClose }: Props) {
  const [hex, setHex] = useState(color.toUpperCase());
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const applyHex = () => {
    const value = normalizeHex(hex);
    if (!value) {
      setError("Enter a hex colour like #E0654D or #E64.");
      return;
    }
    setError("");
    setHex(value.toUpperCase());
    onColor(value);
  };

  const swatch = (value: string, name: string, key: string) => {
    const active = value === color;
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={name}
        title={name}
        className={`color-swatch${active ? " active" : ""}`}
        data-color={value}
        style={swatchStyle(value)}
        onClick={() => {
          onColor(value);
          setHex(value.toUpperCase());
          setError("");
        }}
      />
    );
  };

  return (
    <Panel id="color" title="Colour" onClose={onClose}>
      <div className="color-current">
        <span className="color-current-swatch" style={swatchStyle(color)} aria-hidden="true" />
        <div>
          <div className="color-current-name" id="current-color-name">
            {colorName(color)}
          </div>
          <div className="color-current-hex">{color.toUpperCase()}</div>
        </div>
      </div>

      <div className="panel-section">
        <label className="panel-label" htmlFor="custom-hex">
          Custom colour
        </label>
        <div className="custom-color-row">
          <input
            type="color"
            id="custom-color-native"
            aria-label="Pick any colour"
            value={color}
            onChange={(e) => {
              setHex(e.target.value.toUpperCase());
              setError("");
              onColor(e.target.value.toLowerCase(), false);
            }}
            onBlur={(e) => onColor(e.target.value.toLowerCase(), true)}
          />
          <input
            type="text"
            id="custom-hex"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            value={hex}
            aria-invalid={!!error}
            aria-describedby="custom-hex-error"
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyHex();
            }}
          />
          <button type="button" id="custom-hex-apply" className="btn-secondary" onClick={applyHex}>
            Apply
          </button>
        </div>
        <p id="custom-hex-error" className="field-error" role="alert">
          {error}
        </p>
      </div>

      <div className="panel-section">
        <span className="panel-label" id="recent-label">
          Recent
        </span>
        {recent.length ? (
          <div id="recent-colors" className="swatch-row" role="radiogroup" aria-labelledby="recent-label">
            {recent.map((c) => swatch(c, `${colorName(c)} (recent)`, `recent-${c}`))}
          </div>
        ) : (
          <p className="panel-hint">Colours you pick appear here.</p>
        )}
      </div>

      <div id="color-palette" role="radiogroup" aria-label="Colour palette">
        {PALETTE.map((g) => {
          const open = !collapsed[g.id];
          return (
            <div className="color-group" key={g.id}>
              <button
                type="button"
                className="group-toggle"
                aria-expanded={open}
                aria-controls={`group-${g.id}`}
                onClick={() => setCollapsed((c) => ({ ...c, [g.id]: open }))}
              >
                <span>{g.label}</span>
                <span className={`chevron${open ? " open" : ""}`}>
                  <LineIcon name="chevron" size={16} />
                </span>
              </button>
              {open && (
                <div className="swatch-grid" id={`group-${g.id}`}>
                  {g.colors.map((c) => swatch(c.value, c.name, c.value))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

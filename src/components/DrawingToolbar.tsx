import type { CSSProperties, ReactNode } from "react";
import { colorName } from "../lib/colors";
import type { BrushType, CameraMode, ShapeKind, Tool } from "../types";
import { BrushPreview } from "./BrushPreview";
import { LineIcon, type LineIconName } from "./Icons";
import type { PanelId } from "./Panel";

interface Props {
  tool: Tool;
  color: string;
  brush: BrushType;
  thickness: number;
  opacity: number;
  glow: number;
  eraserSize: number;
  cameraMode: CameraMode;
  openPanel: PanelId | null;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (t: Tool) => void;
  onTogglePanel: (p: PanelId) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onToggleCamera: () => void;
}

const isShape = (t: Tool): t is ShapeKind => t === "line" || t === "rect" || t === "circle" || t === "arrow";

function RailButton({
  id,
  label,
  icon,
  active,
  pressed,
  panel,
  expanded,
  disabled,
  danger,
  onClick,
  children,
}: {
  id: string;
  label: string;
  icon?: LineIconName;
  active?: boolean;
  pressed?: boolean;
  panel?: PanelId;
  expanded?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      className={`toolbar-btn${active ? " active" : ""}${danger ? " danger" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-haspopup={panel ? "dialog" : undefined}
      aria-expanded={panel ? expanded : undefined}
      aria-controls={panel ? `panel-${panel}` : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? <LineIcon name={icon} size={19} /> : children}
    </button>
  );
}

/**
 * Compact studio rail: vertical on the right on desktop, a horizontally
 * scrollable bottom bar on phones. Detailed settings open in panels.
 */
export function DrawingToolbar(p: Props) {
  const shapeTool = isShape(p.tool) ? p.tool : null;
  const panelOpen = (id: PanelId) => p.openPanel === id;

  return (
    <div id="toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="toolbar-group" role="group" aria-label="Tools">
        <RailButton
          id="tool-brush"
          label="Brush (B)"
          icon="brush"
          active={p.tool === "brush"}
          pressed={p.tool === "brush"}
          onClick={() => p.onTool("brush")}
        />
        <RailButton
          id="tool-eraser"
          label="Eraser (E)"
          icon="eraser"
          active={p.tool === "eraser"}
          pressed={p.tool === "eraser"}
          onClick={() => p.onTool("eraser")}
        />
        <RailButton
          id="tool-shapes"
          label={shapeTool ? `Shapes: ${shapeTool}` : "Shapes"}
          icon={shapeTool ?? "shapes"}
          active={!!shapeTool}
          panel="shapes"
          expanded={panelOpen("shapes")}
          onClick={() => p.onTogglePanel("shapes")}
        />
      </div>

      <div className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group" role="group" aria-label="Colour and brush">
        <RailButton
          id="btn-color"
          label={`Colour: ${colorName(p.color)}`}
          panel="color"
          expanded={panelOpen("color")}
          onClick={() => p.onTogglePanel("color")}
        >
          <span
            className="color-swatch active"
            id="active-color-preview"
            title={colorName(p.color)}
            style={{ "--swatch-color": p.color } as CSSProperties}
          />
        </RailButton>
        <RailButton
          id="btn-brush-settings"
          label="Brush settings"
          panel="brush"
          expanded={panelOpen("brush")}
          onClick={() => p.onTogglePanel("brush")}
        >
          <BrushPreview
            className="rail-preview"
            brush={p.tool === "eraser" ? "eraser" : p.brush}
            color={p.color}
            thickness={Math.min(p.thickness, 8)}
            opacity={p.opacity}
            glow={p.glow}
            eraserSize={p.eraserSize}
            shape={shapeTool ?? undefined}
            width={30}
            height={30}
          />
        </RailButton>
      </div>

      <div className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group" role="group" aria-label="History">
        <RailButton id="btn-undo" label="Undo (Ctrl+Z)" icon="undo" disabled={!p.canUndo} onClick={p.onUndo} />
        <RailButton id="btn-redo" label="Redo (Ctrl+Y)" icon="redo" disabled={!p.canRedo} onClick={p.onRedo} />
      </div>

      <div className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group" role="group" aria-label="Canvas">
        <RailButton
          id="btn-background"
          label="Canvas background"
          icon="background"
          panel="background"
          expanded={panelOpen("background")}
          onClick={() => p.onTogglePanel("background")}
        />
        <RailButton
          id="btn-camera-toggle"
          label="Toggle camera view"
          icon="camera"
          active={p.cameraMode !== "dark"}
          pressed={p.cameraMode !== "dark"}
          onClick={p.onToggleCamera}
        />
        <RailButton
          id="btn-artwork"
          label="Save, open & export"
          icon="artwork"
          panel="artwork"
          expanded={panelOpen("artwork")}
          onClick={() => p.onTogglePanel("artwork")}
        />
        <RailButton
          id="btn-options"
          label="Options & shortcuts"
          icon="options"
          panel="options"
          expanded={panelOpen("options")}
          onClick={() => p.onTogglePanel("options")}
        />
      </div>

      <div className="toolbar-divider" aria-hidden="true" />

      <RailButton id="btn-clear" label="Clear canvas (Delete)" icon="trash" danger onClick={p.onClear} />
    </div>
  );
}

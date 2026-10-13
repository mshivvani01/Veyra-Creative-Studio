import { BRAND, CAMERA_MODE_LABEL, LOGO_SRC, MARK_SRC } from "../lib/constants";
import type { CameraMode } from "../types";

/** Compact Veyra mark + wordmark shown in the top-left corner of the studio. */
export function BrandBadge() {
  return (
    <div id="brand-badge" title={`${BRAND.name} — ${BRAND.tagline}`}>
      <img src={LOGO_SRC} alt={BRAND.name} className="brand-badge-logo" width={103} height={28} />
      <img src={MARK_SRC} alt={BRAND.name} className="brand-badge-mark" width={28} height={28} />
    </div>
  );
}

/** Pill showing the camera view mode; clicking it cycles the mode. */
export function CameraModeIndicator({ mode, onClick }: { mode: CameraMode; onClick: () => void }) {
  return (
    <button
      type="button"
      id="camera-mode-indicator"
      className={mode === "dark" ? "dark-mode" : undefined}
      onClick={onClick}
      aria-label={`${CAMERA_MODE_LABEL[mode]}. Click to change camera view`}
    >
      <span className="camera-dot" aria-hidden="true" />
      <span id="camera-mode-text">{CAMERA_MODE_LABEL[mode]}</span>
    </button>
  );
}

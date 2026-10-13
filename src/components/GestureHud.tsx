import type { HudState } from "../lib/constants";
import { GestureIcon } from "./Icons";

/** Bottom-centre pill showing the current tracking state / gesture. */
export function GestureHud({ hud }: { hud: HudState }) {
  return (
    <div id="gesture-hud" className={hud.cls || undefined} role="status" aria-live="polite" aria-atomic="true">
      <div id="gesture-icon" aria-hidden="true">
        <GestureIcon name={hud.icon} size={18} />
      </div>
      <div id="gesture-label">{hud.label}</div>
    </div>
  );
}

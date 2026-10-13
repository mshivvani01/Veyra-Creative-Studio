import { useEffect, useRef } from "react";
import { BRAND, LOGO_SRC, type GestureIconName } from "../lib/constants";
import { GestureIcon } from "./Icons";

const ITEMS = [
  { icon: "draw", title: "Draw", text: "Point index finger to draw" },
  { icon: "erase", title: "Erase", text: "Sweep open palm to erase" },
  { icon: "move", title: "Move", text: "Pinch to grab & reposition" },
  { icon: "idle", title: "Idle", text: "Close fist to rest" },
] satisfies { icon: GestureIconName; title: string; text: string }[];

/** "How to Play" onboarding modal with the "Let's Go!" call to action. */
export function GestureInstructions({ onStart }: { onStart: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the dialog itself (not the button) so screen readers announce it
    // without drawing a focus ring the reference doesn't show; Tab moves to the CTA.
    contentRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // The only focusable control is the CTA: keep focus inside the dialog.
      if (e.key === "Tab") {
        e.preventDefault();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div id="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-content" ref={contentRef} tabIndex={-1}>
        <img src={LOGO_SRC} alt={BRAND.name} className="onboarding-logo" width={162} height={44} />
        <p className="brand-tagline">{BRAND.tagline}</p>
        <h2 className="onboarding-title" id="onboarding-title">
          How to Play
        </h2>
        <ul className="onboarding-grid">
          {ITEMS.map((it) => (
            <li className="onboarding-item" key={it.title}>
              <div className="onboarding-icon" aria-hidden="true">
                <GestureIcon name={it.icon} size={22} />
              </div>
              <div className="onboarding-text">
                <strong>{it.title}</strong>
                <span>{it.text}</span>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" id="btn-start" className="btn-primary" ref={buttonRef} onClick={onStart}>
          Let's Go!
        </button>
      </div>
    </div>
  );
}

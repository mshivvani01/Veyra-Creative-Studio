import { useEffect, useRef, type ReactNode } from "react";
import { LineIcon } from "./Icons";

export type PanelId = "color" | "brush" | "shapes" | "background" | "artwork" | "options";

interface Props {
  id: PanelId;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Popover panel anchored beside the toolbar rail (a bottom sheet on phones).
 * Closes on outside pointerdown (except on its own rail toggle) and via the
 * close button; Escape is handled by the studio's keyboard shortcuts.
 */
export function Panel({ id, title, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t)) return;
      // Clicking the rail button that toggles this panel is handled by the button itself.
      if (t.closest?.(`[aria-controls="panel-${id}"]`)) return;
      // Dialogs opened from a panel (confirmations) must not close it.
      if (t.closest?.("#confirm-dialog")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [id, onClose]);

  // Move focus into the panel so keyboard users land in it.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section id={`panel-${id}`} className="panel" role="dialog" aria-label={title} ref={ref} tabIndex={-1}>
      <header className="panel-header">
        <h2 className="panel-title">{title}</h2>
        <button type="button" className="panel-close" aria-label={`Close ${title}`} onClick={onClose}>
          <LineIcon name="close" size={18} />
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

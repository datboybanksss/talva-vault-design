import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shared modal wrapper for the .tvp-modal design system.
 *
 * Renders into document.body via a portal. `position: fixed` is resolved
 * against the nearest ancestor that establishes a containing block — any
 * ancestor with a transform, filter, backdrop-filter, perspective or
 * `contain: paint/layout` does that — so a modal left inline in the page tree
 * can silently fall out of the viewport and land at the bottom of the page.
 * Portalling to <body> removes that whole class of failure, and also lifts the
 * backdrop out of any parent stacking context or `overflow: hidden` clip.
 *
 * Also handles the behaviour every modal needs: backdrop click, Escape to
 * close, background scroll lock, and dialog semantics.
 */
export function ModalShell({
  onClose,
  children,
  maxWidth = 560,
  labelledBy,
  closeOnBackdrop = true,
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  labelledBy?: string;
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // SSR / prerender has no document; the modal is only ever open client-side.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="tvp-modal-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        className="tvp-modal"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

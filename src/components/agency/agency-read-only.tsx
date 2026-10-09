import { createContext, useContext, useEffect, type RefObject } from "react";

/**
 * Read-only mode for a suspended (offboarded) agency. The database and server
 * refuse every write regardless; this only keeps write controls out of sight.
 */
export type AgencyReadOnlyState = { until: string; notice: string } | null;

export const AgencyReadOnlyContext = createContext<AgencyReadOnlyState>(null);

export function useAgencyReadOnly() {
  return useContext(AgencyReadOnlyContext);
}

/** Labels that change data. View, download, copy, preview, print and export stay. */
const WRITE_LABEL =
  /^\s*\+?\s*(invite|new|create|add|save|upload|delete|remove|edit|send|resend|revoke|request|record|link to|apply|reset|convert|mark|end|reactivate|change|assign|replace|rename|move|duplicate|set|clear|verify|import|approve|reject|accept|decline|file|confirm|skip|share|unshare|stop sharing|update|enable|disable|restore|archive|upgrade|regenerate|cancel request)\b/i;

export function isWriteLabel(label: string | null | undefined) {
  return !!label && WRITE_LABEL.test(label);
}

/** Hides write buttons/links inside `root` while the agency is read-only. */
export function useHideWriteControls(root: RefObject<HTMLElement | null>, readOnly: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sweep = () => {
      el.querySelectorAll<HTMLElement>("button, a[role='button'], a.tvp-btn, a[class*='btn']").forEach((b) => {
        if (b.closest("[data-read-only-safe]")) return;
        const label = b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent;
        const hide = readOnly && isWriteLabel(label);
        b.classList.toggle("tvp-ro-hidden", hide);
      });
    };
    sweep();
    if (!readOnly) return;
    const obs = new MutationObserver(sweep);
    obs.observe(el, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [root, readOnly]);
}

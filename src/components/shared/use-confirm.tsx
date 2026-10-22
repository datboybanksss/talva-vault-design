import { useCallback, useRef, useState, type ReactNode } from "react";
import { ModalShell } from "@/components/shared/modal-shell";

type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
};

/**
 * In-app replacement for window.confirm(). The browser dialog can be silently
 * suppressed (embedded previews, some mobile browsers), which made actions look
 * unresponsive. Render `dialog` once; `await confirm({...})` resolves true/false.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = opts ? (
    <ModalShell onClose={() => close(false)} maxWidth={460} labelledBy="tvp-confirm-title">
      <h2 className="tvp-h2" id="tvp-confirm-title">
        {opts.title}
      </h2>
      {opts.body && (
        <div className="tvp-muted" style={{ marginTop: 8 }}>
          {opts.body}
        </div>
      )}
      <div className="tvp-form-footer">
        <button type="button" className="tvp-secondary" onClick={() => close(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={opts.destructive ? "tvp-danger" : "tvp-primary"}
          onClick={() => close(true)}
          autoFocus
        >
          {opts.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </ModalShell>
  ) : null;

  return { confirm, dialog };
}

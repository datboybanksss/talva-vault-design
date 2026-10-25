import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { statusLabel, statusPillClass } from "@/lib/status-labels";
import { QUARANTINE_MESSAGES, quarantineFromError, type QuarantineReason } from "@/lib/document-quarantine";

/** Status pill for a document the file checker blocked. Icon + text, never colour alone. */
export function BlockedDocumentPill({ reason }: { reason: QuarantineReason | null | undefined }) {
  if (!reason) return null;
  return (
    <span
      className={statusPillClass("document", "blocked_security")}
      title={QUARANTINE_MESSAGES[reason]}
      style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
      {statusLabel("document", "blocked_security")}
    </span>
  );
}

/** Explains why a blocked document can't be opened, in the app's toast style. */
export function explainBlocked(reason: QuarantineReason) {
  toast.error(QUARANTINE_MESSAGES[reason]);
}

/** For mutation onError: shows the blocked explanation when the server refused for that reason. */
export function explainIfBlocked(err: unknown): boolean {
  const reason = quarantineFromError(err);
  if (reason) explainBlocked(reason);
  return reason !== null;
}

/** disabledReason for every open/preview/download/copy/share/AI action on a blocked row. */
export function blockedReason(reason: QuarantineReason | null | undefined): string | null {
  return reason ? QUARANTINE_MESSAGES[reason] : null;
}

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "./modal-shell";
import { BlockedDocumentPill } from "./blocked-document";
import { QUARANTINE_MESSAGES, type QuarantineReason } from "@/lib/document-quarantine";

export function BlockedOnboardingDocument({ reason }: { reason: QuarantineReason | null }) {
  const [open, setOpen] = useState(false);
  if (!reason) return null;
  return <>
    <BlockedDocumentPill reason={reason} />
    <Button variant="ghost" size="icon" aria-label="Why this document is blocked" title="Why this document is blocked" onClick={() => setOpen(true)}><Info /></Button>
    {open && <ModalShell onClose={() => setOpen(false)} labelledBy="blocked-onboarding-title">
      <h2 id="blocked-onboarding-title" className="tvp-h2">Blocked for security</h2>
      <p className="tvp-muted mt-3">{QUARANTINE_MESSAGES[reason]}</p>
      <div className="tvp-form-footer"><Button onClick={() => setOpen(false)}>Close</Button></div>
    </ModalShell>}
  </>;
}
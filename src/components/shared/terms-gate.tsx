import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ModalShell } from "@/components/shared/modal-shell";
import { LegalDocumentView } from "@/components/shared/legal-document-view";
import { acceptCurrentTerms, getMyTermsStatus, type TermsPortal } from "@/lib/terms-acceptance.functions";

/**
 * Blocks the portal until the signed-in user has accepted the current Terms
 * & Conditions for their role. The portal content is not rendered meanwhile.
 */
export function TermsGate({ portal, children }: { portal: TermsPortal; children: ReactNode }) {
  const statusFn = useServerFn(getMyTermsStatus);
  const acceptFn = useServerFn(acceptCurrentTerms);
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["terms-status", portal],
    queryFn: () => statusFn({ data: { portal } }),
    staleTime: 60_000,
  });

  if (!data?.required || !data.current) return <>{children}</>;
  const doc = data.current;
  const hadPrevious = data.acceptances.some((a) => a.doc_type === portal);

  async function accept() {
    setBusy(true);
    try {
      const res = await acceptFn({ data: { portal, document_id: doc.id } });
      toast.success(res.proof_ref ? `Thank you. Your proof reference is ${res.proof_ref}.` : "Thank you.");
      await qc.invalidateQueries({ queryKey: ["terms-status", portal] });
    } catch (e: any) {
      toast.error(e?.message ?? "We couldn't record your acceptance. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={() => undefined} closeOnBackdrop={false} maxWidth={720} labelledBy="terms-gate-title">
      <div style={{ padding: 24 }}>
        <h2 id="terms-gate-title" className="tvp-h2" style={{ margin: 0 }}>
          {hadPrevious ? "Our Terms & Conditions have been updated" : "Please accept our Terms & Conditions"}
        </h2>
        <p className="tvp-muted" style={{ marginTop: 6 }}>
          {doc.title} · version {doc.version}. Please read them before you continue to your portal.
        </p>
        <LegalDocumentView body={doc.body} maxHeight={380} />
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 14, fontSize: 14 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I have read and accept these Terms & Conditions (version {doc.version}).</span>
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            className="tvp-btn"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sign out
          </button>
          <button className="tvp-primary" disabled={!agreed || busy} onClick={accept}>
            {busy ? "Recording…" : "Accept and continue"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

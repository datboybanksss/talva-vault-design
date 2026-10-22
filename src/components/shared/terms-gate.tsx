import { useCallback, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DocumentModal } from "@/components/shared/document-modal";
import { LegalDocumentView } from "@/components/shared/legal-document-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { termsGateError } from "@/lib/terms-gate-core";
import {
  acceptCurrentTerms,
  getMyTermsStatus,
  type TermsPortal,
  type TermsStatus,
} from "@/lib/terms-acceptance.functions";

/** Keep portal content unmounted until the Terms status is known. */
export function TermsGate({ portal, children }: { portal: TermsPortal; children: ReactNode }) {
  const statusFn = useServerFn(getMyTermsStatus);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["terms-status", portal],
    queryFn: () => statusFn({ data: { portal } }),
    staleTime: 60_000,
    refetchOnMount: "always",
  });
  if (isPending || isError) {
    return (
      <DocumentModal title="Terms & Conditions" onClose={() => undefined} busy className="tvp-terms-modal">
        <p role="status">{isError ? "We couldn't load your Terms & Conditions. Please try again." : "Loading Terms & Conditions…"}</p>
        {isError && <Button onClick={() => void refetch()}>Try again</Button>}
        <SignOut />
      </DocumentModal>
    );
  }
  if (!data?.required || !data.current) return <>{children}</>;
  return <TermsAgreement key={`${portal}:${data.current.id}:${data.current.body_sha256}`} portal={portal} doc={data.current} hadPrevious={data.acceptances.some((a) => a.doc_type === portal)} />;
}

function SignOut({ disabled = false }: { disabled?: boolean }) {
  return <Button variant="secondary" className="tvp-secondary" disabled={disabled} onClick={async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.href = "/auth";
    } catch {
      toast.error("We couldn't sign you out. Please try again.");
    }
  }}>Sign out</Button>;
}

function TermsAgreement({ portal, doc, hadPrevious }: {
  portal: TermsPortal;
  doc: NonNullable<TermsStatus["current"]>;
  hadPrevious: boolean;
}) {
  const acceptFn = useServerFn(acceptCurrentTerms);
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const reachedEnd = useCallback(() => setReadToEnd(true), []);
  const title = hadPrevious ? "Our Terms & Conditions have been updated" : "Please accept our Terms & Conditions";
  const effective = new Date(doc.effective_at);
  const effectiveDate = Number.isNaN(effective.getTime()) ? null : effective.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  async function accept() {
    if (!readToEnd || !agreed || busy) return;
    setBusy(true);
    try {
      const res = await acceptFn({ data: { portal, document_id: doc.id, body_sha256: doc.body_sha256 } });
      toast.success(res.proof_ref ? `Thank you. Your proof reference is ${res.proof_ref}.` : "Thank you.");
      await qc.invalidateQueries();
    } catch (error: unknown) {
      toast.error(termsGateError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DocumentModal title={title} onClose={() => undefined} busy className="tvp-terms-modal">
      <header className="tvp-terms-header">
        <h2 className="tvp-terms-title">{title}</h2>
        <p className="tvp-terms-document-title">{doc.title}</p>
        <div className="tvp-terms-meta">
          <span>Version {doc.version}</span>
          {effectiveDate && <span>Effective <time dateTime={doc.effective_at}>{effectiveDate}</time></span>}
        </div>
      </header>
      <LegalDocumentView body={doc.body} maxHeight={380} onReachedEnd={reachedEnd} />
      <div className="tvp-terms-agreement">
        <p id="terms-scroll-help" className="tvp-terms-helper" aria-live="polite">
          {readToEnd ? "You can now confirm your agreement." : "Scroll to the end of the document to enable the agreement checkbox."}
        </p>
        <div className="tvp-terms-checkbox-row">
          <Checkbox id="terms-agreed" aria-describedby="terms-scroll-help" checked={agreed} disabled={!readToEnd || busy} onCheckedChange={(checked) => setAgreed(checked === true)} />
          <label htmlFor="terms-agreed">I have read and accept these Terms & Conditions (version {doc.version}).</label>
        </div>
      </div>
      <footer className="tvp-terms-actions">
        <SignOut disabled={busy} />
        <Button className="tvp-primary" disabled={!readToEnd || !agreed || busy} aria-busy={busy} onClick={accept}>
          {busy && <LoaderCircle className="tvp-terms-spinner" aria-hidden="true" />}
          {busy ? "Recording…" : "Accept and continue"}
        </Button>
      </footer>
    </DocumentModal>
  );
}
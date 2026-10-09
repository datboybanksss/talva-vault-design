import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ModalShell } from "@/components/shared/modal-shell";
import { LegalDocumentView } from "@/components/shared/legal-document-view";
import { getAcceptedTermsText, getMyTermsStatus, type TermsPortal } from "@/lib/terms-acceptance.functions";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The signed-in user's own Terms acceptances, with the exact text accepted. */
export function MyTermsAcceptances({ portal }: { portal: TermsPortal }) {
  const statusFn = useServerFn(getMyTermsStatus);
  const textFn = useServerFn(getAcceptedTermsText);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["terms-status", portal],
    queryFn: () => statusFn({ data: { portal } }),
  });
  const text = useQuery({
    queryKey: ["terms-text", openId],
    queryFn: () => textFn({ data: { acceptance_id: openId! } }),
    enabled: !!openId,
  });
  const rows = data?.acceptances ?? [];

  return (
    <div className="tvp-card" style={{ padding: 20 }}>
      <h3 className="tvp-h3" style={{ margin: 0 }}>Terms & Conditions</h3>
      <p className="tvp-muted" style={{ marginTop: 4 }}>
        Every version you have accepted. Quote the proof reference if you ever need to refer to an acceptance.
      </p>
      {rows.length === 0 ? (
        <p className="tvp-muted" style={{ marginTop: 12 }}>No acceptance recorded yet.</p>
      ) : (
        <div className="tvp-table-wrap" style={{ marginTop: 12 }}>
          <table className="tvp-table">
            <thead>
              <tr><th>Terms</th><th>Version</th><th>Accepted</th><th>Proof reference</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.doc_type === "talent" ? "Talent" : "Agency"} Terms & Conditions</td>
                  <td>{a.version}</td>
                  <td>{fmt(a.accepted_at)}</td>
                  <td><code>{a.proof_ref ?? "—"}</code></td>
                  <td><button className="tvp-link" onClick={() => setOpenId(a.id)}>Read this version</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && (
        <ModalShell onClose={() => setOpenId(null)} maxWidth={720}>
          <div style={{ padding: 24 }}>
            <h2 className="tvp-h2" style={{ margin: 0 }}>
              {text.data ? `${text.data.title} · version ${text.data.version}` : "Loading…"}
            </h2>
            {text.data && <LegalDocumentView body={text.data.body} maxHeight={480} />}
            {text.error && <p className="tvp-muted">{(text.error as Error).message}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="tvp-secondary" onClick={() => setOpenId(null)}>Close</button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

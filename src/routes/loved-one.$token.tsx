import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Clock, Download, Folder, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getLovedOneShareByToken, getLovedOneDownloadUrl } from "@/lib/loved-one.functions";

export const Route = createFileRoute("/loved-one/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Loved-One Access · TalVault" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Time-bound access to documents shared with you via TalVault." },
    ],
  }),
  component: LovedOnePage,
});

function LovedOnePage() {
  const { token } = Route.useParams();
  const load = useServerFn(getLovedOneShareByToken);
  const download = useServerFn(getLovedOneDownloadUrl);
  const [state, setState] = useState<any>({ status: "loading" });

  useEffect(() => {
    load({ data: { token } }).then(setState).catch((e) => setState({ status: "error", error: e?.message }));
  }, [token]);

  async function onDownload(docId: string) {
    try {
      const { url } = await download({ data: { token, document_id: docId } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    }
  }

  if (state.status === "loading") {
    return <Shell><p>Loading…</p></Shell>;
  }
  if (state.status === "not_found" || state.status === "error") {
    return (
      <Shell>
        <Invalid title="Link not found" body="This magic link doesn't exist. Double-check the URL your Loved One sent you." />
      </Shell>
    );
  }
  if (state.status === "expired") {
    return <Shell><Invalid title="Link expired" body="Ask the person who shared this to create a new link." /></Shell>;
  }
  if (state.status === "revoked") {
    return <Shell><Invalid title="Access revoked" body="The person who shared this has revoked the link." /></Shell>;
  }

  const share = state.share;
  const folders: any[] = state.folders ?? [];
  const documents: any[] = state.documents ?? [];
  const byFolder = new Map<string | null, any[]>();
  for (const d of documents) {
    const k = d.folder_id ?? null;
    if (!byFolder.has(k)) byFolder.set(k, []);
    byFolder.get(k)!.push(d);
  }

  return (
    <Shell>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#064E58" }}>Hi {share.loved_one_name}</h1>
        <p style={{ color: "#65707A", fontSize: 14, marginTop: 6 }}>
          {state.sharer?.full_name ?? "A TalVault user"} has shared the documents below with you.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 12, color: "#65707A" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Clock className="h-3 w-3" /> Access ends {new Date(share.expires_at).toLocaleString()}
          </span>
        </div>
        {share.note && (
          <div style={{ marginTop: 12, background: "#F9FAFB", border: "1px solid #E5E7EB", padding: 12, borderRadius: 8, fontSize: 13 }}>
            {share.note}
          </div>
        )}
      </div>

      {folders.map((f) => {
        const docs = byFolder.get(f.id) ?? [];
        return (
          <FolderBlock key={f.id} name={f.name} docs={docs} onDownload={onDownload} />
        );
      })}

      {(byFolder.get(null)?.length ?? 0) > 0 && (
        <FolderBlock name="Additional documents" docs={byFolder.get(null)!} onDownload={onDownload} />
      )}

      {documents.length === 0 && (
        <p style={{ color: "#65707A", fontSize: 14 }}>Nothing has been shared yet.</p>
      )}
    </Shell>
  );
}

function FolderBlock({ name, docs, onDownload }: { name: string; docs: any[]; onDownload: (id: string) => void }) {
  return (
    <div style={{ background: "white", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Folder className="h-4 w-4" style={{ color: "#064E58" }} />
        <strong>{name}</strong>
        <span style={{ color: "#65707A", fontSize: 12 }}>({docs.length})</span>
      </div>
      {docs.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 13 }}>No documents.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 10, border: "1px solid #F3F4F6", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText className="h-4 w-4" style={{ color: "#065E58" }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{d.name}</div>
                  <div style={{ color: "#9CA3AF", fontSize: 11 }}>
                    {d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB · ` : ""}
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onDownload(d.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#064E58", color: "white", padding: "6px 12px", borderRadius: 6, fontSize: 13, border: 0, cursor: "pointer" }}
              >
                <Download className="h-3 w-3" /> Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Invalid({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ border: "1px solid #FDE68A", background: "#FFFBEB", padding: 20, borderRadius: 12, textAlign: "center" }}>
      <AlertTriangle className="h-8 w-8" style={{ color: "#E89348", margin: "0 auto 8px" }} />
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
      <p style={{ color: "#65707A", fontSize: 14, marginTop: 6 }}>{body}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F1", padding: "40px 16px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, background: "#064E58", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck className="h-5 w-5" style={{ color: "white" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#064E58" }}>TalVault</div>
            <div style={{ fontSize: 11, color: "#65707A" }}>Loved-One Access</div>
          </div>
        </div>
        {children}
        <div style={{ marginTop: 24, textAlign: "center", color: "#9CA3AF", fontSize: 11 }}>
          Access is time-bound and can be revoked at any time by the sharer.
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createAgencyInvitationDraft,
  finalizeAgencyInvitation,
  listAgencyInvitations,
  listComplianceDocuments,
  recordComplianceDocument,
  deleteComplianceDocument,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  CheckCircle2,
  Upload,
  Trash2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/invitations/new")({
  validateSearch: (raw: Record<string, unknown>) => ({
    draft: typeof raw.draft === "string" ? raw.draft : "",
  }),
  head: () => ({ meta: [{ title: "New Invitation · TalVault Admin" }] }),
  component: NewInvitationPage,
});

type BusinessType = "formal" | "informal";

type Slot = { key: string; label: string };

const SLOTS: Record<BusinessType, Slot[]> = {
  formal: [
    { key: "cipc", label: "CIPC registration document" },
    { key: "director_id", label: "Director ID document(s)" },
    { key: "proof_of_address", label: "Proof of business address" },
  ],
  informal: [
    { key: "sa_id", label: "South African ID document" },
    { key: "proof_of_address", label: "Proof of residential address" },
  ],
};

function NewInvitationPage() {
  const { draft: draftIdFromUrl } = Route.useSearch();
  const nav = useNavigate();
  const qc = useQueryClient();

  const createDraftFn = useServerFn(createAgencyInvitationDraft);
  const finalizeFn = useServerFn(finalizeAgencyInvitation);
  const listInvsFn = useServerFn(listAgencyInvitations);
  const listDocsFn = useServerFn(listComplianceDocuments);
  const recordDocFn = useServerFn(recordComplianceDocument);
  const deleteDocFn = useServerFn(deleteComplianceDocument);

  const [draftId, setDraftId] = useState<string>(draftIdFromUrl || "");

  // Phase 1 form state
  const [agencyName, setAgencyName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [expiryDays, setExpiryDays] = useState(14);
  // Phase 2 extras
  const [regContact, setRegContact] = useState("");
  const [regMobile, setRegMobile] = useState("");

  // If arriving with a draft id, hydrate the fields from the invitations list.
  const invQ = useQuery({
    queryKey: ["admin", "invitations"],
    queryFn: () => listInvsFn(),
    enabled: !!draftIdFromUrl,
  });
  const draftRow = (invQ.data ?? []).find((i: any) => i.id === draftIdFromUrl);
  const hydratedRef = useRef(false);
  if (draftRow && !hydratedRef.current) {
    hydratedRef.current = true;
    setAgencyName(draftRow.agency_name ?? "");
    setContact(draftRow.contact_person ?? "");
    setEmail(draftRow.email ?? "");
    setBusinessType((draftRow.business_type as BusinessType) ?? "");
    setRegContact(draftRow.registered_contact_number ?? "");
    setRegMobile(draftRow.registered_mobile_number ?? "");
  }

  const createDraftM = useMutation({
    mutationFn: () =>
      createDraftFn({
        data: {
          agency_name: agencyName,
          contact_person: contact || undefined,
          email,
          business_type: businessType as BusinessType,
          expiry_days: expiryDays,
        },
      }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setDraftId(row.id);
      toast.success("Draft saved. Upload compliance documents to send.");
      nav({ to: "/admin/invitations/new", search: { draft: row.id } as any, replace: true });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save draft"),
  });

  const docsQ = useQuery({
    queryKey: ["admin", "compliance", draftId],
    queryFn: () => listDocsFn({ data: { invitation_id: draftId } }),
    enabled: !!draftId,
  });
  const docs: any[] = docsQ.data ?? [];

  const finalizeM = useMutation({
    mutationFn: () =>
      finalizeFn({
        data: {
          id: draftId,
          registered_contact_number: regContact || undefined,
          registered_mobile_number: regMobile || undefined,
          expiry_days: expiryDays,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Invitation sent. Recipient will receive the branded email.");
      nav({ to: "/admin/invitations" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to send invitation"),
  });

  const deleteDocM = useMutation({
    mutationFn: (id: string) => deleteDocFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "compliance", draftId] });
      toast.success("Document removed.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove document"),
  });

  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  async function uploadForSlot(slotKey: string, file: File) {
    if (!draftId) return;
    setUploadingSlot(slotKey);
    try {
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${draftId}/${slotKey}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("agency-compliance-docs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      await recordDocFn({
        data: {
          invitation_id: draftId,
          doc_slot: slotKey,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      qc.invalidateQueries({ queryKey: ["admin", "compliance", draftId] });
      toast.success(`${file.name} uploaded.`);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploadingSlot(null);
    }
  }

  const canSaveDraft =
    !draftId &&
    agencyName.trim() &&
    email.trim() &&
    businessType &&
    !createDraftM.isPending;

  const slotList = businessType ? SLOTS[businessType as BusinessType] : [];
  const uploadedSlots = new Set(docs.map((d) => d.doc_slot));
  const missingSlots = slotList.filter((s) => !uploadedSlots.has(s.key));
  const missingPhone =
    businessType === "formal"
      ? !regContact.trim()
      : businessType === "informal"
        ? !regMobile.trim()
        : true;
  const canSend =
    !!draftId && missingSlots.length === 0 && !missingPhone && !finalizeM.isPending;

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link
            to="/admin/invitations"
            className="tvp-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
          >
            <ArrowLeft className="h-3 w-3" /> Back to invitations
          </Link>
          <h1 className="tvp-h1" style={{ marginTop: 4 }}>
            {draftId ? "Continue Agency Invitation" : "New Agency Invitation"}
          </h1>
          <div className="tvp-subtitle">
            Two-step: save a draft, upload the compliance documents required by the business type,
            then send. The invited agency does not upload these — you do.
          </div>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        {/* Phase indicator */}
        <div style={{ display: "flex", gap: 12, marginBottom: 18, fontSize: 13 }}>
          <span
            className="tvp-status"
            style={{
              background: draftId ? "var(--tvp-green-soft, #E7F5EE)" : "rgba(6,78,88,0.1)",
              color: draftId ? "var(--tvp-green)" : "var(--tvp-teal)",
            }}
          >
            {draftId ? "✓ Step 1: Draft saved" : "Step 1: Draft details"}
          </span>
          <span
            className="tvp-status"
            style={{
              background: draftId ? "rgba(6,78,88,0.1)" : "rgba(0,0,0,0.05)",
              color: draftId ? "var(--tvp-teal)" : "var(--tvp-muted)",
            }}
          >
            Step 2: Compliance & send
          </span>
        </div>

        {/* Phase 1 form */}
        <fieldset
          disabled={!!draftId}
          style={{ border: "none", padding: 0, margin: 0, opacity: draftId ? 0.7 : 1 }}
        >
          <div className="tvp-form-group">
            <label>Agency name *</label>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              required
              placeholder="e.g. NewTech Talent Agency"
            />
          </div>
          <div className="tvp-form-group">
            <label>Primary contact person</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. Maya Johnson"
            />
          </div>
          <div className="tvp-form-group">
            <label>Contact email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="contact@agency.com"
            />
          </div>
          <div className="tvp-form-group">
            <label>Business type *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(["formal", "informal"] as BusinessType[]).map((t) => {
                const active = businessType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBusinessType(t)}
                    className="tvp-card"
                    style={{
                      textAlign: "left",
                      padding: 14,
                      cursor: draftId ? "not-allowed" : "pointer",
                      border: active
                        ? "2px solid var(--tvp-teal)"
                        : "1px solid var(--tvp-border)",
                      background: active ? "rgba(6,78,88,0.06)" : "var(--tvp-surface)",
                    }}
                  >
                    <div style={{ fontWeight: 600, textTransform: "capitalize", marginBottom: 4 }}>
                      {t}
                    </div>
                    <div className="tvp-muted" style={{ fontSize: 12 }}>
                      {t === "formal"
                        ? "Registered business / (Pty) Ltd / CC"
                        : "Sole trader / individual operator"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="tvp-form-group">
            <label>Invitation expiry (days)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value) || 14)}
            />
          </div>
        </fieldset>

        {!draftId && (
          <div className="tvp-footer-actions">
            <Link to="/admin/invitations" className="tvp-secondary">
              Cancel
            </Link>
            <button
              className="tvp-primary"
              type="button"
              disabled={!canSaveDraft}
              onClick={() => createDraftM.mutate()}
            >
              {createDraftM.isPending ? "Saving…" : "Save draft & continue →"}
            </button>
          </div>
        )}
      </div>

      {/* Phase 2 — compliance docs */}
      {draftId && businessType && (
        <div className="tvp-card tvp-panel" style={{ marginTop: 16 }}>
          <h2 className="tvp-h2">Compliance documents ({businessType})</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Upload one file per required slot. All are mandatory before the invitation can be sent.
            Documents are stored privately and are visible only to administrators.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            {slotList.map((slot) => {
              const uploaded = docs.filter((d) => d.doc_slot === slot.key);
              const isUploading = uploadingSlot === slot.key;
              return (
                <div
                  key={slot.key}
                  className="tvp-callout"
                  style={{
                    padding: 12,
                    border: `1px solid ${uploaded.length ? "var(--tvp-green)" : "var(--tvp-border)"}`,
                    borderRadius: 8,
                    background: uploaded.length ? "rgba(22,163,74,0.06)" : "var(--tvp-surface)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {uploaded.length ? (
                        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--tvp-green)" }} />
                      ) : (
                        <AlertCircle className="h-4 w-4" style={{ color: "var(--tvp-amber)" }} />
                      )}
                      <strong style={{ fontSize: 14 }}>{slot.label}</strong>
                      <span className="tvp-muted" style={{ fontSize: 12 }}>
                        {uploaded.length ? "Uploaded" : "Required"}
                      </span>
                    </div>
                    <label className="tvp-secondary" style={{ cursor: "pointer" }}>
                      <Upload className="h-4 w-4" />
                      {isUploading ? "Uploading…" : uploaded.length ? "Replace / add" : "Upload"}
                      <input
                        type="file"
                        style={{ display: "none" }}
                        disabled={isUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadForSlot(slot.key, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {uploaded.length > 0 && (
                    <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
                      {uploaded.map((u) => (
                        <li
                          key={u.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 13,
                            padding: "4px 0",
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" style={{ color: "var(--tvp-muted)" }} />
                          <span>{u.file_name}</span>
                          <span className="tvp-muted" style={{ fontSize: 11 }}>
                            {u.size_bytes ? `${Math.round(u.size_bytes / 1024)} KB` : ""}
                          </span>
                          <button
                            className="tvp-mini-btn"
                            title="Remove"
                            style={{ marginLeft: "auto" }}
                            onClick={() => deleteDocM.mutate(u.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="tvp-form-group" style={{ marginTop: 16 }}>
            <label>
              {businessType === "formal"
                ? "Registered business contact number *"
                : "Registered mobile number *"}
            </label>
            <input
              type="tel"
              placeholder="e.g. +27 82 123 4567"
              value={businessType === "formal" ? regContact : regMobile}
              onChange={(e) =>
                businessType === "formal"
                  ? setRegContact(e.target.value)
                  : setRegMobile(e.target.value)
              }
            />
          </div>

          {!canSend && (
            <div
              className="tvp-callout"
              style={{
                padding: 10,
                marginTop: 8,
                background: "rgba(232,147,72,0.08)",
                border: "1px solid var(--tvp-amber)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <strong>Cannot send yet.</strong>{" "}
              {missingSlots.length > 0 && (
                <>Missing: {missingSlots.map((s) => s.label).join(", ")}. </>
              )}
              {missingPhone && <>Phone number required. </>}
            </div>
          )}

          <div className="tvp-footer-actions">
            <Link to="/admin/invitations" className="tvp-secondary">
              Save & close
            </Link>
            <button
              type="button"
              className="tvp-primary"
              disabled={!canSend}
              onClick={() => finalizeM.mutate()}
            >
              {finalizeM.isPending ? "Sending…" : "Create & send invitation"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

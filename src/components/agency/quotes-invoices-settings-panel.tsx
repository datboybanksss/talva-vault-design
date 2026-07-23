import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Receipt, FileSpreadsheet, Image as ImageIcon, Palette, Save, Trash2, Upload } from "lucide-react";
import {
  getAgencyBillingSettings,
  updateAgencyBillingSettings,
  updateAgencyLogoPath,
} from "@/lib/agency.functions";
import { supabase } from "@/integrations/supabase/client";

const ACCENT_PRESETS = [
  { name: "TalVault Teal", value: "#064E58" },
  { name: "Slate", value: "#334155" },
  { name: "Indigo", value: "#4338CA" },
  { name: "Amber", value: "#B45309" },
  { name: "Emerald", value: "#047857" },
  { name: "Rose", value: "#BE185D" },
];

export function QuotesInvoicesSettingsPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAgencyBillingSettings);
  const saveFn = useServerFn(updateAgencyBillingSettings);
  const logoFn = useServerFn(updateAgencyLogoPath);

  const { data, isLoading } = useQuery({
    queryKey: ["agency", "billing-settings"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !form) {
      setForm({
        default_quote_acceptance_days: data.default_quote_acceptance_days ?? 14,
        default_quote_reminder_days: data.default_quote_reminder_days ?? 7,
        default_invoice_payment_days: data.default_invoice_payment_days ?? 30,
        invoice_overdue_grace_days: data.invoice_overdue_grace_days ?? 3,
        is_vat_registered: !!data.is_vat_registered,
        vat_number: data.vat_number ?? "",
        default_vat_rate_bp: data.default_vat_rate_bp ?? 1500,
        billing_address: data.billing_address ?? "",
        accent_color: data.accent_color ?? "#064E58",
      });
    }
  }, [data, form]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          default_quote_acceptance_days: Number(form.default_quote_acceptance_days),
          default_quote_reminder_days: Number(form.default_quote_reminder_days),
          default_invoice_payment_days: Number(form.default_invoice_payment_days),
          invoice_overdue_grace_days: Number(form.invoice_overdue_grace_days),
          is_vat_registered: !!form.is_vat_registered,
          vat_number: form.vat_number?.trim() || null,
          default_vat_rate_bp: Number(form.default_vat_rate_bp),
          billing_address: form.billing_address?.trim() || null,
          accent_color: form.accent_color || null,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["agency", "billing-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  async function handleLogoUpload(file: File) {
    if (!data?.id) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${data.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("agency-branding")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      await logoFn({ data: { storage_path: path } });
      toast.success("Logo uploaded");
      qc.invalidateQueries({ queryKey: ["agency", "billing-settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    if (!confirm("Remove agency logo?")) return;
    await logoFn({ data: { storage_path: null } });
    toast.success("Logo removed");
    qc.invalidateQueries({ queryKey: ["agency", "billing-settings"] });
  }

  if (isLoading || !form) {
    return <div className="tvp-muted" style={{ padding: 16 }}>Loading settings…</div>;
  }

  const update = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h2 className="tvp-h2">Quotes &amp; Invoices Settings</h2>
          <div className="tvp-subtitle">
            Defaults for quote acceptance, invoice payment, VAT handling, and branding.
          </div>
        </div>
      </div>

      <div className="tvp-rule-grid" style={{ marginTop: 14 }}>
        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3">
            <Clock className="inline h-4 w-4 mr-1" />Quote Acceptance
          </h3>
          <div className="tvp-form-group">
            <label>Default acceptance window (days)</label>
            <input
              type="number" min={1} max={365}
              value={form.default_quote_acceptance_days}
              onChange={(e) => update("default_quote_acceptance_days", e.target.value)}
            />
          </div>
          <div className="tvp-form-group">
            <label>Reminder cadence (days before expiry)</label>
            <input
              type="number" min={1} max={365}
              value={form.default_quote_reminder_days}
              onChange={(e) => update("default_quote_reminder_days", e.target.value)}
            />
          </div>
        </div>

        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3">
            <Receipt className="inline h-4 w-4 mr-1" />Invoice Payment
          </h3>
          <div className="tvp-form-group">
            <label>Default payment terms (days)</label>
            <input
              type="number" min={1} max={365}
              value={form.default_invoice_payment_days}
              onChange={(e) => update("default_invoice_payment_days", e.target.value)}
            />
          </div>
          <div className="tvp-form-group">
            <label>Overdue grace period (days)</label>
            <input
              type="number" min={0} max={365}
              value={form.invoice_overdue_grace_days}
              onChange={(e) => update("invoice_overdue_grace_days", e.target.value)}
            />
            <div className="tvp-muted" style={{ fontSize: 11, marginTop: 4 }}>
              Automatic overdue-marking is not enabled — mark manually via the Status dropdown.
            </div>
          </div>
        </div>

        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3">
            <FileSpreadsheet className="inline h-4 w-4 mr-1" />VAT / Tax
          </h3>
          <div className="tvp-form-group">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.is_vat_registered}
                onChange={(e) => update("is_vat_registered", e.target.checked)}
              />
              Registered for VAT (show "Tax Invoice")
            </label>
          </div>
          <div className="tvp-form-group">
            <label>VAT registration number</label>
            <input
              value={form.vat_number}
              onChange={(e) => update("vat_number", e.target.value)}
              placeholder="e.g. 4123456789"
              disabled={!form.is_vat_registered}
            />
          </div>
          <div className="tvp-form-group">
            <label>Default VAT rate (%)</label>
            <input
              type="number" min={0} max={100} step={0.01}
              value={(form.default_vat_rate_bp / 100).toFixed(2)}
              onChange={(e) =>
                update("default_vat_rate_bp", Math.round(Number(e.target.value) * 100))
              }
            />
          </div>
        </div>

        <div className="tvp-card tvp-panel">
          <h3 className="tvp-h3">
            <ImageIcon className="inline h-4 w-4 mr-1" />Branding
          </h3>
          <div className="tvp-form-group">
            <label>Billing address (appears on documents)</label>
            <textarea
              rows={3}
              value={form.billing_address}
              onChange={(e) => update("billing_address", e.target.value)}
              placeholder="Street, Suburb, City, Postal code"
            />
          </div>
          <div className="tvp-form-group">
            <label>Agency logo</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {data?.logo_url ? (
                <img
                  src={data.logo_url}
                  alt="Logo"
                  style={{
                    maxHeight: 60, maxWidth: 160, background: "#f7f7f5",
                    padding: 6, borderRadius: 4, border: "1px solid #eee",
                  }}
                />
              ) : (
                <div className="tvp-muted" style={{ fontSize: 12 }}>No logo uploaded</div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
              />
              <button
                className="tvp-secondary"
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />{uploading ? "Uploading…" : data?.logo_url ? "Replace" : "Upload"}
              </button>
              {data?.logo_url && (
                <button className="tvp-mini-btn" title="Remove logo" onClick={removeLogo}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="tvp-muted" style={{ fontSize: 11, marginTop: 6 }}>
              PNG, JPG, SVG or WEBP. Max 2 MB. Displayed at the top-left of every document.
            </div>
          </div>
          <div className="tvp-form-group">
            <label>
              <Palette className="inline h-3 w-3 mr-1" />Accent color
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.name}
                  onClick={() => update("accent_color", p.value)}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: p.value,
                    border: form.accent_color === p.value ? "3px solid #111" : "1px solid #ddd",
                    cursor: "pointer",
                  }}
                />
              ))}
              <input
                type="color"
                value={form.accent_color || "#064E58"}
                onChange={(e) => update("accent_color", e.target.value)}
                style={{ width: 32, height: 32, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer" }}
              />
              <span className="tvp-muted" style={{ fontSize: 12 }}>{form.accent_color}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button className="tvp-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4" />{save.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </>
  );
}

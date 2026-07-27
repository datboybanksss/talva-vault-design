/**
 * AI-assisted document filing — server functions.
 *
 * suggestDocumentFiling: run after a document row already exists. Reads the
 * stored file, asks the model for a destination + expiry, returns the suggestion
 * plus the closed catalog the UI offers as manual alternatives. Nothing is filed.
 *
 * confirmDocumentFiling: applies the human-confirmed destination/expiry/reminder.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TALENT_BUCKET = "talent-private-documents";
const AGENCY_BUCKET = "talent-documents";

const ScopeEnum = z.enum(["talent", "agency"]);

const SuggestInput = z.object({
  scope: ScopeEnum,
  document_id: z.string().uuid(),
});

const ConfirmInput = z.object({
  scope: ScopeEnum,
  document_id: z.string().uuid(),
  /** talent: folder uuid | agency: folder name. null = leave unfiled. */
  destination: z.string().nullable(),
  expires_at: z.string().nullable(),
  reminder_at: z.string().nullable(),
  ai_assisted: z.boolean().default(false),
});

async function callerAgencyId(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", userId)
    .eq("suspended", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: not an agency member");
  return data.agency_id as string;
}

// -----------------------------------------------------------------------------
// suggestDocumentFiling
// -----------------------------------------------------------------------------
export const suggestDocumentFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SuggestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const {
      isAiReadableFile,
      requestFilingSuggestion,
      type: _t,
    } = (await import("@/lib/ai-filing.server")) as typeof import("@/lib/ai-filing.server") & {
      type?: never;
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let bucket: string;
    let storagePath: string | null;
    let fileName: string;
    let mimeType: string | null;
    let sizeBytes: number | null;
    let catalog: { id: string; label: string }[] = [];
    let defaultReminderDays = 30;
    let secondaryHint: string | null = null;

    if (data.scope === "talent") {
      const { data: doc, error } = await supabase
        .from("talent_private_documents")
        .select("id, user_id, name, storage_path, mime_type, size_bytes")
        .eq("id", data.document_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!doc || doc.user_id !== userId) throw new Error("Not found.");

      bucket = TALENT_BUCKET;
      storagePath = doc.storage_path;
      fileName = doc.name;
      mimeType = doc.mime_type;
      sizeBytes = doc.size_bytes;

      const { data: folders } = await supabase
        .from("talent_private_folders")
        .select("id, parent_id, name, sort_order")
        .eq("user_id", userId)
        .is("removed_at", null)
        .order("sort_order", { ascending: true });

      const rows = (folders ?? []) as {
        id: string;
        parent_id: string | null;
        name: string;
        sort_order: number;
      }[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const labelFor = (r: (typeof rows)[number]): string => {
        const parts: string[] = [r.name];
        let cur = r.parent_id ? byId.get(r.parent_id) : undefined;
        let guard = 0;
        while (cur && guard++ < 5) {
          parts.unshift(cur.name);
          cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
        }
        return parts.join(" -> ");
      };
      catalog = rows.map((r) => ({ id: r.id, label: labelFor(r) }));

      const { data: profile } = await supabase
        .from("talent_profiles")
        .select("expiry_notice_days, agency_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (profile?.expiry_notice_days) defaultReminderDays = profile.expiry_notice_days;
      if (profile?.agency_id) {
        secondaryHint =
          "This stays in your Private Vault. Your Manager cannot see it unless you share it to the Agency Shared Folder.";
      }
    } else {
      const agencyId = await callerAgencyId(supabase, userId);
      const { data: doc, error } = await supabase
        .from("talent_shared_documents")
        .select("id, agency_id, talent_link_id, name, storage_path")
        .eq("id", data.document_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!doc || doc.agency_id !== agencyId) throw new Error("Not found.");

      bucket = AGENCY_BUCKET;
      storagePath = doc.storage_path;
      fileName = doc.name;
      mimeType = null;
      sizeBytes = null;

      const { data: folders } = await supabase
        .from("agency_talent_folders")
        .select("folder_name, sort_order")
        .eq("agency_id", agencyId)
        .eq("talent_link_id", doc.talent_link_id)
        .order("sort_order", { ascending: true });
      catalog = ((folders ?? []) as { folder_name: string }[]).map((f) => ({
        id: f.folder_name,
        label: f.folder_name,
      }));

      const { data: agency } = await supabase
        .from("agencies")
        .select("expiry_notice_days")
        .eq("id", agencyId)
        .maybeSingle();
      if (agency?.expiry_notice_days) defaultReminderDays = agency.expiry_notice_days;
      secondaryHint =
        "Filed into the talent's Agency Shared Folder. The talent's Private Vault stays out of reach.";
    }

    const base = {
      catalog,
      defaultReminderDays,
      secondaryHint,
      fileName,
    };

    if (!storagePath) {
      return { ...base, suggestion: null, status: "no_file" as const };
    }

    // Download the stored object (service role — the caller was already authorised above).
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);
    if (dlErr || !blob) {
      console.error("[ai-filing] download failed", dlErr?.message);
      return { ...base, suggestion: null, status: "error" as const };
    }

    const resolvedMime = mimeType || blob.type || null;
    const resolvedSize = sizeBytes ?? blob.size ?? null;
    if (!isAiReadableFile(resolvedMime, resolvedSize)) {
      return { ...base, suggestion: null, status: "unsupported" as const };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.error("[ai-filing] LOVABLE_API_KEY missing");
      return { ...base, suggestion: null, status: "error" as const };
    }

    try {
      const suggestion = await requestFilingSuggestion({
        apiKey,
        bytes: await blob.arrayBuffer(),
        mimeType: resolvedMime as string,
        fileName,
        catalog,
      });

      if (!suggestion) return { ...base, suggestion: null, status: "no_suggestion" as const };

      // Agency docs persist the suggestion so a half-finished review can resume.
      if (data.scope === "agency") {
        await supabase
          .from("talent_shared_documents")
          .update({
            ai_suggested_folder: suggestion.folder_label,
            ai_suggested_expiry: suggestion.expiry_date
              ? new Date(suggestion.expiry_date).toISOString()
              : null,
          })
          .eq("id", data.document_id);
      }

      return { ...base, suggestion, status: "ok" as const };
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg === "AI_RATE_LIMITED")
        return { ...base, suggestion: null, status: "rate_limited" as const };
      if (msg === "AI_CREDITS_EXHAUSTED")
        return { ...base, suggestion: null, status: "credits" as const };
      console.error("[ai-filing] suggestion failed", err);
      return { ...base, suggestion: null, status: "error" as const };
    }
  });

// -----------------------------------------------------------------------------
// confirmDocumentFiling
// -----------------------------------------------------------------------------
export const confirmDocumentFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;

    if (data.scope === "talent") {
      const { data: doc } = await supabase
        .from("talent_private_documents")
        .select("id, user_id")
        .eq("id", data.document_id)
        .maybeSingle();
      if (!doc || doc.user_id !== userId) throw new Error("Not found.");

      const patch: Record<string, unknown> = {
        expires_at: data.expires_at,
        reminder_at: data.reminder_at,
      };
      if (data.destination) patch.folder_id = data.destination;

      const { error } = await supabase
        .from("talent_private_documents")
        .update(patch)
        .eq("id", data.document_id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const agencyId = await callerAgencyId(supabase, userId);
    const { data: doc } = await supabase
      .from("talent_shared_documents")
      .select("id, agency_id, name, talent_link_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (!doc || doc.agency_id !== agencyId) throw new Error("Not found.");

    if (data.destination) {
      const { data: allowed } = await supabase
        .from("agency_talent_folders")
        .select("folder_name")
        .eq("agency_id", agencyId)
        .eq("talent_link_id", doc.talent_link_id)
        .eq("folder_name", data.destination)
        .maybeSingle();
      if (!allowed) throw new Error("That folder isn't allowed for this talent.");
    }

    const patch: Record<string, unknown> = {
      status: "filed",
      validity_expires_at: data.expires_at,
    };
    if (data.destination) patch.folder = data.destination;

    const { error } = await supabase
      .from("talent_shared_documents")
      .update(patch)
      .eq("id", data.document_id);
    if (error) throw new Error(error.message);

    await supabase.from("agency_audit_log").insert({
      agency_id: agencyId,
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: data.ai_assisted ? "document_filed_ai_assisted" : "document_filed_manual",
      target_type: "document",
      target_id: data.document_id,
      target_label: doc.name,
      detail: {
        folder: data.destination,
        expires_at: data.expires_at,
        ai_assisted: data.ai_assisted,
      },
    });

    return { ok: true };
  });

/**
 * Document filing review — server functions.
 *
 * getFilingCatalog: returns the closed catalog of destinations the reviewer may
 * file a freshly uploaded document into, the portal's default reminder lead
 * time, and whether the caller has "Organise documents with AI" switched on.
 * No document-content AI service is wired up yet — the UI seeds its suggestion
 * from a filename heuristic, which is recorded with source 'filename', never
 * 'ai'. When a real suggestion service lands it can return a `suggestion`
 * object from here (or from its own function) without any UI rework.
 *
 * confirmDocumentFiling: applies the human-confirmed destination/expiry/
 * reminder and stores where each value came from (folder_source / expiry_source:
 * 'ai' | 'filename' | 'user'). A source of 'ai' is refused while no AI analysis
 * has actually run — today that is always, because no AI service is connected.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTermsAccepted } from "@/lib/terms-guard";
import { z } from "zod";

const ScopeEnum = z.enum(["talent", "agency"]);
const SourceEnum = z.enum(["ai", "filename", "user"]);

const CatalogInput = z.object({
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
  /** Where the folder and expiry values came from. */
  folder_source: SourceEnum.nullable().default(null),
  expiry_source: SourceEnum.nullable().default(null),
  ai_assisted: z.boolean().default(false),
});

const SkipInput = z.object({
  scope: ScopeEnum,
  document_id: z.string().uuid(),
});

/** The caller's own "Organise documents with AI" preference (default on). */
async function callerAiEnabled(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("ai_filing_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.ai_filing_enabled !== false;
}

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
  await assertTermsAccepted(supabase, userId, "agency");
  return data.agency_id as string;
}

/** Filing changes are writes: refused while the agency is suspended (read-only). */
async function writableAgencyId(supabase: any, userId: string) {
  const agencyId = await callerAgencyId(supabase, userId);
  const { data: ok, error } = await supabase.rpc("agency_is_writable", { _agency_id: agencyId });
  if (error) throw new Error(error.message);
  if (!ok) throw new Error("AGENCY_READ_ONLY: your agency's TalVault access has ended. Existing documents are view and download only.");
  return agencyId;
}

/**
 * No document-content AI service is connected yet, so no filing can legitimately
 * carry an 'ai' source. Refuse it rather than record a provenance we cannot
 * prove. When a real service lands, this check becomes "analysis ran and the
 * caller's AI switch is on".
 */
function assertSourcesAllowed(
  aiEnabled: boolean,
  folderSource: string | null,
  expirySource: string | null,
) {
  if (folderSource === "ai" || expirySource === "ai") {
    if (!aiEnabled) {
      throw new Error("AI filing is switched off for your account, so values can't be saved as AI-suggested.");
    }
    throw new Error("No AI analysis ran for this document, so values can't be saved as AI-suggested.");
  }
}

// -----------------------------------------------------------------------------
// getFilingCatalog
// -----------------------------------------------------------------------------
export const getFilingCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CatalogInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    let catalog: { id: string; label: string }[] = [];
    let defaultReminderDays = 30;
    let secondaryHint: string | null = null;
    let currentDestination: string | null = null;
    let fileName = "";

    if (data.scope === "talent") {
      const { data: doc, error } = await supabase
        .from("talent_private_documents")
        .select("id, user_id, name, folder_id, expires_at")
        .eq("id", data.document_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!doc || doc.user_id !== userId) throw new Error("Not found.");
      fileName = doc.name;
      currentDestination = doc.folder_id ?? null;

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
        return parts.join(" → ");
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
      const agencyId = await writableAgencyId(supabase, userId);
      const { data: doc, error } = await supabase
        .from("talent_shared_documents")
        .select("id, agency_id, talent_link_id, name, folder")
        .eq("id", data.document_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!doc || doc.agency_id !== agencyId) throw new Error("Not found.");
      fileName = doc.name;
      currentDestination = doc.folder ?? null;

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
      if (catalog.length === 0 && currentDestination) {
        catalog = [{ id: currentDestination, label: currentDestination }];
      }

      const { data: agency } = await supabase
        .from("agencies")
        .select("expiry_notice_days")
        .eq("id", agencyId)
        .maybeSingle();
      if (agency?.expiry_notice_days) defaultReminderDays = agency.expiry_notice_days;
      secondaryHint =
        "Filed into the talent's Agency Shared Folder. The talent's Private Vault stays out of reach.";
    }

    const aiEnabled = await callerAiEnabled(supabase, userId);
    return { catalog, defaultReminderDays, secondaryHint, currentDestination, fileName, aiEnabled };
  });

// -----------------------------------------------------------------------------
// confirmDocumentFiling
// -----------------------------------------------------------------------------
export const confirmDocumentFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const aiEnabled = await callerAiEnabled(supabase, userId);
    assertSourcesAllowed(aiEnabled, data.folder_source, data.expiry_source);

    if (data.scope === "talent") {
      const { data: doc } = await supabase
        .from("talent_private_documents")
        .select("id, user_id, name")
        .eq("id", data.document_id)
        .maybeSingle();
      if (!doc || doc.user_id !== userId) throw new Error("Not found.");

      const patch: Record<string, unknown> = {
        expires_at: data.expires_at,
        reminder_at: data.reminder_at,
        pending_review: false,
        folder_source: data.folder_source,
        expiry_source: data.expiry_source,
      };

      if (data.destination) patch.folder_id = data.destination;

      const { error } = await supabase
        .from("talent_private_documents")
        .update(patch)
        .eq("id", data.document_id);
      if (error) throw new Error(error.message);

      await supabase.from("talent_audit_log").insert({
        actor_id: userId,
        actor_email: claims?.email ?? null,
        action: "document_filing_confirmed",
        target_type: "private_document",
        target_id: data.document_id,
        target_label: doc.name,
        detail: {
          folder: data.destination,
          expires_at: data.expires_at,
          folder_source: data.folder_source,
          expiry_source: data.expiry_source,
        },
      });
      return { ok: true };
    }

    const agencyId = await writableAgencyId(supabase, userId);
    const { data: doc } = await supabase
      .from("talent_shared_documents")
      .select("id, agency_id, name, talent_link_id, folder")
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
      if (!allowed && data.destination !== doc.folder) {
        throw new Error("That folder isn't allowed for this talent.");
      }
    }

    const patch: Record<string, unknown> = {
      validity_expires_at: data.expires_at,
      reminder_at: data.reminder_at,
      pending_review: false,
      folder_source: data.folder_source,
      expiry_source: data.expiry_source,
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
      action: "document_filing_confirmed",
      target_type: "document",
      target_id: data.document_id,
      target_label: doc.name,
      detail: {
        folder: data.destination,
        expires_at: data.expires_at,
        folder_source: data.folder_source,
        expiry_source: data.expiry_source,
        ai_assisted: data.ai_assisted,
      },
    });

    return { ok: true };
  });



// -----------------------------------------------------------------------------
// skipDocumentFiling — defer the decision, leave the document exactly as uploaded
// -----------------------------------------------------------------------------
export const skipDocumentFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SkipInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;

    if (data.scope === "talent") {
      const { data: doc } = await supabase
        .from("talent_private_documents")
        .select("id, user_id")
        .eq("id", data.document_id)
        .maybeSingle();
      if (!doc || doc.user_id !== userId) throw new Error("Not found.");

      const { error } = await supabase
        .from("talent_private_documents")
        .update({ pending_review: true })
        .eq("id", data.document_id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const agencyId = await writableAgencyId(supabase, userId);
    const { data: doc } = await supabase
      .from("talent_shared_documents")
      .select("id, agency_id, name")
      .eq("id", data.document_id)
      .maybeSingle();
    if (!doc || doc.agency_id !== agencyId) throw new Error("Not found.");

    const { error } = await supabase
      .from("talent_shared_documents")
      .update({ pending_review: true })
      .eq("id", data.document_id);
    if (error) throw new Error(error.message);

    await supabase.from("agency_audit_log").insert({
      agency_id: agencyId,
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: "document_filing_skipped",
      target_type: "document",
      target_id: data.document_id,
      target_label: doc.name,
      detail: {},
    });

    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Per-user "Organise documents with AI" preference (default on)
// -----------------------------------------------------------------------------
export const getAiFilingPreference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    return { aiEnabled: await callerAiEnabled(supabase, userId) };
  });

export const setAiFilingPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ai_filing_enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("profiles")
      .update({ ai_filing_enabled: data.ai_filing_enabled })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, aiEnabled: data.ai_filing_enabled };
  });

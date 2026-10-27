import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "@/integrations/supabase/types";
import { databaseError } from "./security-errors";
/**
 * Document filing review — server functions.
 *
 * getFilingCatalog: the closed catalog of destinations, the portal's default
 * reminder lead time, and whether the caller has "Organise documents with AI" on.
 *
 * getDocumentAnalysis / startDocumentAnalysis: poll and (re)start the Parserly
 * analysis for one document (see document-ai.server.ts / parserly.server.ts).
 *
 * confirmDocumentFiling: applies the human-confirmed destination/expiry/
 * reminder and stores where each value came from ('ai' | 'filename' | 'user').
 * 'ai' is accepted only for a completed analysis whose values match exactly.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTalentWritable, assertTermsAccepted } from "@/lib/terms-guard";
import { z } from "zod";
import { applyAiPreferenceChange, checkAiSources } from "@/lib/document-ai-core";

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
  destination: z.string().max(10000).nullable(),
  expires_at: z.string().max(10000).nullable(),
  reminder_at: z.string().max(10000).nullable(),
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
async function callerAiEnabled(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("ai_filing_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw databaseError(error);
  return data?.ai_filing_enabled !== false;
}

async function callerAgencyId(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", userId)
    .eq("suspended", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new Error("Forbidden: not an agency member");
  await assertTermsAccepted(supabase, userId, "agency");
  return data.agency_id as string;
}

/** Filing changes are writes: refused while the agency is suspended (read-only). */
async function writableAgencyId(supabase: SupabaseClient<Database>, userId: string) {
  const agencyId = await callerAgencyId(supabase, userId);
  const { data: ok, error } = await supabase.rpc("agency_is_writable", { _agency_id: agencyId });
  if (error) throw databaseError(error);
  if (!ok)
    throw new Error(
      "AGENCY_READ_ONLY: your agency's TalVault access has ended. Existing documents are view and download only.",
    );
  return agencyId;
}

/**
 * 'ai' is accepted only when a completed Parserly analysis exists for the
 * document and the saved value matches what it returned (checkAiSources).
 */
async function assertSourcesAllowed(
  aiEnabled: boolean,
  scope: "talent" | "agency",
  documentId: string,
  data: {
    folder_source: string | null;
    expiry_source: string | null;
    destination: string | null;
    expires_at: string | null;
  },
) {
  if (data.folder_source !== "ai" && data.expiry_source !== "ai") return;
  const { readAnalysis } = await import("@/lib/document-ai.server");
  const analysis = await readAnalysis(scope, documentId);
  const err = checkAiSources({
    aiEnabled,
    analysis,
    folderSource: data.folder_source,
    expirySource: data.expiry_source,
    destination: data.destination,
    expiresAt: data.expires_at,
  });
  if (err) throw new Error(err);
}

/** Authorise the caller for a document before any analysis work. */
async function authoriseForDocument(
  supabase: SupabaseClient<Database>,
  userId: string,
  scope: "talent" | "agency",
  documentId: string,
): Promise<{ agencyId: string | null }> {
  if (scope === "talent") {
    await assertTermsAccepted(supabase, userId, "talent");
    const { data: doc } = await supabase
      .from("talent_private_documents")
      .select("id, user_id")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) throw new Error("Not found.");
    return { agencyId: null };
  }
  const agencyId = await writableAgencyId(supabase, userId);
  const { data: doc } = await supabase
    .from("talent_shared_documents")
    .select("id, agency_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.agency_id !== agencyId) throw new Error("Not found.");
  return { agencyId };
}

// -----------------------------------------------------------------------------
// getFilingCatalog
// -----------------------------------------------------------------------------
export const getFilingCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CatalogInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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
      if (error) throw databaseError(error);
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
      if (error) throw databaseError(error);
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
    const { supabase, userId, claims } = context;
    const aiEnabled = await callerAiEnabled(supabase, userId);
    await assertSourcesAllowed(aiEnabled, data.scope, data.document_id, data);

    if (data.scope === "talent") {
      await assertTalentWritable(supabase, userId);
      const { data: doc } = await supabase
        .from("talent_private_documents")
        .select("id, user_id, name")
        .eq("id", data.document_id)
        .maybeSingle();
      if (!doc || doc.user_id !== userId) throw new Error("Not found.");

      const patch: TablesUpdate<"talent_private_documents"> = {
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
      if (error) throw databaseError(error);

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

    const patch: TablesUpdate<"talent_shared_documents"> = {
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
    if (error) throw databaseError(error);

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
    const { supabase, userId, claims } = context;

    if (data.scope === "talent") {
      await assertTalentWritable(supabase, userId);
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
      if (error) throw databaseError(error);
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
    if (error) throw databaseError(error);

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
    const { supabase, userId } = context;
    return { aiEnabled: await callerAiEnabled(supabase, userId) };
  });

export const setAiFilingPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ai_filing_enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ ai_filing_enabled: data.ai_filing_enabled })
      .eq("id", userId);
    if (error) throw databaseError(error);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cancelQueuedAnalysesFor } = await import("@/lib/document-ai.server");
    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("agency_members")
      .select("agency_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (membershipError) throw databaseError(membershipError);

    await applyAiPreferenceChange(data.ai_filing_enabled, {
      audit: async (next) => {
        const entry = {
          actor_id: userId,
          actor_email: claims?.email ?? null,
          action: next ? "ai_filing_switched_on" : "ai_filing_switched_off",
          target_type: "user_preference",
          target_id: userId,
          target_label: "Organise documents with AI",
          detail: { ai_filing_enabled: next, changed_at: new Date().toISOString() },
        };
        const agencyIds = [
          ...new Set((memberships ?? []).map((m: { agency_id: string }) => m.agency_id)),
        ];
        const { error: auditErr } = agencyIds.length
          ? await supabaseAdmin
              .from("agency_audit_log")
              .insert(agencyIds.map((agency_id) => ({ ...entry, agency_id })))
          : await supabaseAdmin.from("talent_audit_log").insert(entry);
        if (auditErr) throw databaseError(auditErr);
      },
      cancelQueued: () => cancelQueuedAnalysesFor(userId),
    });
    return { ok: true, aiEnabled: data.ai_filing_enabled };
  });

// -----------------------------------------------------------------------------
// Document AI analysis status (polled by the filing popup) and (re)start
// -----------------------------------------------------------------------------
const AnalysisInput = z.object({ scope: ScopeEnum, document_id: z.string().uuid() });

/** Advances a queued/processing analysis one step and returns its state. */
export const getDocumentAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await authoriseForDocument(supabase, userId, data.scope, data.document_id);
    const { advanceDocumentAnalysis } = await import("@/lib/document-ai.server");
    return advanceDocumentAnalysis({
      scope: data.scope,
      documentId: data.document_id,
      requesterId: userId,
    });
  });

/** Retry, "Analyse with AI", or switching AI on from the popup. */
export const startDocumentAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalysisInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.scope === "talent") await assertTalentWritable(supabase, userId);
    const { agencyId } = await authoriseForDocument(supabase, userId, data.scope, data.document_id);
    const { restartAnalysis } = await import("@/lib/document-ai.server");
    return restartAnalysis({
      scope: data.scope,
      documentId: data.document_id,
      requesterId: userId,
      agencyId,
    });
  });

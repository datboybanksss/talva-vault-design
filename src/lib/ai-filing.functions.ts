/**
 * Document filing review — server functions.
 *
 * getFilingCatalog: returns the closed catalog of destinations the reviewer may
 * file a freshly uploaded document into, plus the portal's default reminder lead
 * time. No AI is involved yet — the UI seeds its "suggestion" from the folder the
 * user picked at upload time. When a real suggestion service lands it can return
 * a `suggestion` object from here (or from its own function) without any UI rework.
 *
 * confirmDocumentFiling: applies the human-confirmed destination/expiry/reminder.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ScopeEnum = z.enum(["talent", "agency"]);

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
      const agencyId = await callerAgencyId(supabase, userId);
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

    return { catalog, defaultReminderDays, secondaryHint, currentDestination, fileName };
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
        ai_assisted: data.ai_assisted,
      },
    });

    return { ok: true };
  });

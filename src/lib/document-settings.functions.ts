import { databaseError } from "./security-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseDocumentSettings, type DocumentSettings } from "@/lib/document-settings";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Only administrators can do this.");
}

/** Admin: TalVault-wide document rules (null = not set yet). */
export const getDocumentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value, updated_at")
      .eq("key", "documents")
      .maybeSingle();
    if (error) throw databaseError(error);
    return {
      settings: parseDocumentSettings(data?.value),
      updatedAt: (data?.updated_at as string) ?? null,
    };
  });

const nullableInt = (max: number) => z.number().int().min(0).max(max).nullable();

export const updateDocumentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        min_retention_years: nullableInt(100),
        recovery_days: nullableInt(3650),
        bulk_delete_threshold: nullableInt(100000),
        bulk_delete_window_minutes: nullableInt(10080),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const { data: canEdit } = await supabase.rpc("can_admin_edit", { _user_id: userId });
    if (!canEdit) throw new Error("You need edit permission to change document rules.");
    const { data: before } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "documents")
      .maybeSingle();
    const value: DocumentSettings = data;
    const { error } = await supabase.from("platform_settings").upsert({
      key: "documents",
      value,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });
    if (error) throw databaseError(error);
    await supabase.from("admin_audit_log").insert({
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: "update_document_settings",
      target_type: "platform_settings",
      target_id: "documents",
      target_label: "Document rules",
      detail: { before: before?.value ?? null, after: value },
    });
    return { ok: true };
  });

/** Admin: bulk-delete flags for the dashboard. */
export const listBulkDeleteFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("document_bulk_delete_flags")
      .select(
        "id, agency_id, deleted_count, threshold, window_minutes, first_deleted_at, last_deleted_at, reviewed_at",
      )
      .is("reviewed_at", null)
      .order("last_deleted_at", { ascending: false })
      .limit(50);
    if (error) throw databaseError(error);
    const ids = Array.from(new Set((data ?? []).map((f: any) => f.agency_id)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: ags } = await supabase.from("agencies").select("id, name").in("id", ids);
      for (const a of ags ?? []) names.set(a.id, a.name);
    }
    return (data ?? []).map((f: any) => ({
      ...f,
      agency_name: names.get(f.agency_id) ?? "Unknown agency",
    }));
  });

export const markBulkDeleteFlagReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("document_bulk_delete_flags")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: userId })
      .eq("id", data.id);
    if (error) throw databaseError(error);
    return { ok: true };
  });

/** Admin: an agency's Recently deleted list, and restore. */
export const adminListRecentlyDeleted = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agencyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase.rpc("list_recently_deleted_documents", {
      _agency_id: data.agencyId,
    });
    if (error) throw databaseError(error);
    return (rows ?? []) as any[];
  });

export const adminRestoreDeletedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: canEdit } = await supabase.rpc("can_admin_edit", { _user_id: userId });
    if (!canEdit) throw new Error("You need edit permission to restore documents.");
    const { error } = await supabase.rpc("restore_deleted_document", { _doc_id: data.id });
    if (error) throw databaseError(error);
    return { ok: true };
  });

/** Agency: the TalVault minimum in force now (null = none set). */
export const getRetentionMinimum = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data } = await supabase.rpc("document_setting", { _name: "min_retention_years" });
    return { minRetentionYears: (data as number | null) ?? null };
  });

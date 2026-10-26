import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { supabase: SupabaseClient; userId: string };
import { parseInput } from "@/lib/admin.functions";
import { duplicateOnboardingName, blockedReplacements } from "./onboarding-documents";
import { reasonForRejection } from "@/lib/document-quarantine";

const Kind = z.enum(["agency", "talent"]);
const SessionInput = z.object({ kind: Kind, session_id: z.string().uuid() });

/** Only admins who can create invitations may stage files. */
async function assertCanInvite(supabase: SupabaseClient, userId: string) {
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("We couldn't confirm your access. Please try again.");
  if (!isAdmin) throw new Error("Forbidden: admin only");
  const { data: canEdit } = await supabase.rpc("can_admin_edit", { _user_id: userId });
  if (!canEdit) throw new Error("Forbidden: view-only administrators cannot perform this action.");
}

const COLUMNS =
  "id, doc_slot, file_name, size_bytes, mime_type, validated_at, quarantine_reason, created_at";

export const listStagedOnboardingDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(SessionInput, d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    await assertCanInvite(supabase, userId);
    // RLS also limits this to the caller's own staged rows.
    const { data: rows, error } = await supabase
      .from("onboarding_staged_uploads")
      .select(COLUMNS)
      .eq("admin_id", userId)
      .eq("session_id", data.session_id)
      .eq("kind", data.kind)
      .order("created_at");
    if (error) throw new Error("We couldn't load the uploaded documents. Please try again.");
    return rows ?? [];
  });

export const stageOnboardingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(
      SessionInput.extend({
        doc_slot: z.string().trim().min(1).max(80),
        file_name: z.string().trim().min(1).max(255),
        storage_path: z.string().min(1).max(1024),
        mime_type: z.string().max(255).optional(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    await assertCanInvite(supabase, userId);
    const { STAGING_BUCKET, stagedPathOwned } = await import("@/lib/onboarding-staging.server");
    const bucket = STAGING_BUCKET[data.kind];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!stagedPathOwned(data.storage_path, userId, data.session_id)) {
      throw new Error("That file does not belong to this invitation.");
    }
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("onboarding_staged_uploads")
      .select("id, file_name, doc_slot, validated_at, quarantine_reason, storage_path")
      .eq("admin_id", userId)
      .eq("session_id", data.session_id)
      .eq("kind", data.kind);
    if (existingError)
      throw new Error("We couldn't load the uploaded documents. Please try again.");
    const dup = duplicateOnboardingName(existing ?? [], data.file_name);
    const slotTaken =
      data.kind === "talent" &&
      (existing ?? []).some(
        (r) => r.doc_slot === data.doc_slot && r.validated_at && !r.quarantine_reason,
      );
    if (dup || slotTaken) {
      await supabaseAdmin.storage.from(bucket).remove([data.storage_path]);
      throw new Error(
        dup
          ? `A document named "${data.file_name}" has already been uploaded for this invitation.`
          : "This document is already attached. Remove it first to replace it.",
      );
    }

    const { validateStoredUpload, UploadRejected } = await import("@/lib/file-validation.server");
    const row: Record<string, unknown> = {
      admin_id: userId,
      session_id: data.session_id,
      kind: data.kind,
      doc_slot: data.doc_slot,
      file_name: data.file_name,
      storage_path: data.storage_path,
    };
    let rejected: Error | null = null;
    try {
      const checked = await validateStoredUpload({
        bucket,
        path: data.storage_path,
        claimedMime: data.mime_type ?? null,
      });
      Object.assign(row, {
        mime_type: checked.mimeType,
        size_bytes: checked.sizeBytes,
        validated_at: new Date().toISOString(),
      });
    } catch (e) {
      if (!(e instanceof UploadRejected)) throw e;
      // The checker has removed the file; the row is kept so the admin sees
      // "Blocked for security" rather than the upload disappearing.
      row.quarantine_reason = reasonForRejection(e.code);
      rejected = e;
    }
    const { data: saved, error } = await supabaseAdmin
      .from("onboarding_staged_uploads")
      .insert(row as never)
      .select(COLUMNS)
      .single();
    if (error) {
      console.error("[onboarding-staging] insert failed", error);
      await supabaseAdmin.storage.from(bucket).remove([data.storage_path]);
      throw new Error("We couldn't save that document. Please try again.");
    }
    if (rejected) throw new Error(rejected.message);
    // The insert trigger atomically replaces blocked rows and queues cleanup.
    const oldPaths = blockedReplacements(existing ?? [], data.doc_slot, data.file_name).map(
      (r) => r.storage_path,
    );
    if (oldPaths.length) await supabaseAdmin.storage.from(bucket).remove(oldPaths);
    return saved;
  });

export const deleteStagedOnboardingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    await assertCanInvite(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("onboarding_staged_uploads")
      .select("id, kind, storage_path, admin_id")
      .eq("id", data.id)
      .maybeSingle();
    // Someone else's staged file is reported exactly like a missing one.
    if (!row || row.admin_id !== userId) throw new Error("Document not found.");
    const { STAGING_BUCKET } = await import("@/lib/onboarding-staging.server");
    await supabaseAdmin.storage
      .from(STAGING_BUCKET[row.kind as "agency" | "talent"])
      .remove([row.storage_path]);
    await supabaseAdmin.from("onboarding_staged_uploads").delete().eq("id", row.id);
    return { ok: true };
  });

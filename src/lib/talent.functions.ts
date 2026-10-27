import { assertNotQuarantined } from "@/lib/document-quarantine";
import { databaseError } from "./security-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTalentTermsAccepted, requireTalentWritable } from "@/lib/terms-guard";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesUpdate } from "@/integrations/supabase/types";
import { billingLinkReadable, billingDocumentBelongsToLinks } from "./billing-share-core";
import { profileName } from "./profile-name";

/**
 * Returns the talent's profile + primary agency link (or null if the caller
 * is signed in but not a talent). Used by the /talent route gate and shell.
 */
export const getTalentContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("talent_profiles")
      .select("id, user_id, agency_id, full_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile)
      return {
        profile: null,
        link: null,
        agency: null,
        links: [] as TalentLinkView[],
        hasActiveLink: false,
        pendingConnectionRequests: 0,
      };

    const links = await loadTalentLinks(supabase, userId);
    const first = links.find((l) => l.state === "active") ?? null;
    const link = first
      ? ((
          await supabase
            .from("agency_talent_links")
            .select("id, agency_id, status, display_name, talent_type, created_at, ended_at")
            .eq("id", first.id)
            .maybeSingle()
        ).data ?? null)
      : null;
    const { data: reqs } = await supabase.rpc("my_link_requests");
    return {
      profile,
      link,
      agency: first ? { id: first.agency_id, name: first.agency_name } : null,
      links,
      hasActiveLink: !!first,
      pendingConnectionRequests: (reqs ?? []).length,
    };
  });

export type TalentLinkView = {
  id: string;
  agency_id: string;
  agency_name: string;
  /** active = linked now; previous = ended but still readable with shared items. */
  state: "active" | "previous";
  shared_docs: number;
};

/**
 * The caller's agency links that should appear anywhere in the Talent portal.
 * Active links always appear. Ended/read-only links appear only as
 * "Previously shared with [agency]" while still readable AND something was
 * actually shared. Invited/unaccepted links never appear. Every agency-only
 * surface (UI and server) decides visibility from this one list.
 */
export async function loadTalentLinks(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TalentLinkView[]> {
  const { data: rows, error: rowsError } = await supabase
    .from("agency_talent_links")
    .select("id, agency_id, status, ended_at, created_at")
    .eq("talent_user_id", userId)
    .order("created_at", { ascending: true });
  // A failed read must never look like "independent talent".
  if (rowsError)
    throw new Error("We couldn't load your agency details. Please refresh and try again.");
  const out: TalentLinkView[] = [];
  const candidates = rows ?? [];
  if (candidates.length === 0) return out;
  const { classifyTalentLink } = await import("@/lib/talent-links-core");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: agencies, error: agenciesError } = await supabaseAdmin
    .from("agencies")
    .select("id, name")
    .in(
      "id",
      candidates.map((r) => r.agency_id),
    );
  if (agenciesError)
    throw new Error("We couldn't load your agency details. Please refresh and try again.");
  const names = new Map((agencies ?? []).map((a) => [a.id, a.name?.trim()]));
  for (const r of candidates) {
    if (!r.ended_at && ["invited", "needs_review", "expired"].includes(r.status)) continue;
    const readUntil = await linkReadUntil(r.id);
    const { count, error: countError } = await supabase
      .from("talent_shared_documents")
      .select("id", { count: "exact", head: true })
      .eq("talent_link_id", r.id);
    if (countError)
      throw new Error("We couldn't load your agency details. Please refresh and try again.");
    const shared = count ?? 0;
    const state = classifyTalentLink({
      status: r.status,
      ended_at: r.ended_at,
      read_until: readUntil,
      shared_docs: shared,
    });
    if (state)
      out.push({
        id: r.id,
        agency_id: r.agency_id,
        agency_name: names.get(r.agency_id) || "Your agency",
        state,
        shared_docs: shared,
      });
  }
  return out;
}

/**
 * When an ended (or offboarded-agency) link stops being readable. null = still
 * open. The fixed post-end window lives only in the database.
 */
async function linkReadUntil(linkId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("talent_link_read_until", { _link_id: linkId });
  if (error) throw databaseError(error);
  return (data as string | null) ?? null;
}

const READ_ONLY_MESSAGE =
  "This connection has ended. Items from this agency are view and download only.";

/** Shape of talent_profiles.notification_prefs (a JSON column), narrowed where read. */
type NotificationPrefs = { in_app_enabled?: boolean; in_app?: Record<string, boolean> };

function readNotificationPrefs(v: Json | undefined): NotificationPrefs {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const inApp = v.in_app;
  return {
    in_app_enabled: typeof v.in_app_enabled === "boolean" ? v.in_app_enabled : undefined,
    in_app:
      inApp && typeof inApp === "object" && !Array.isArray(inApp)
        ? Object.fromEntries(
            Object.entries(inApp).filter((e): e is [string, boolean] => typeof e[1] === "boolean"),
          )
        : undefined,
  };
}

const DEFAULT_IN_APP = {
  agency_share: true,
  doc_expiring: true,
  share_expiring: true,
  ai_review: true,
};

/**
 * Notification preferences — the expiry-warning window plus the per-channel
 * in-app reminder toggles consumed by the reminder engine.
 */
export const getTalentNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("talent_profiles")
      .select("expiry_notice_days, notification_prefs")
      .eq("user_id", userId)
      .maybeSingle();
    const prefs = readNotificationPrefs(data?.notification_prefs);
    return {
      expiryNoticeDays: data?.expiry_notice_days ?? 30,
      inAppEnabled: prefs.in_app_enabled !== false,
      inApp: { ...DEFAULT_IN_APP, ...(prefs.in_app ?? {}) } as Record<string, boolean>,
      // Email delivery stays off until the sending domain is verified.
      emailEnabled: false,
    };
  });

const NotificationPrefsInput = z.object({
  expiry_notice_days: z.number().int().min(1).max(365),
  in_app_enabled: z.boolean().optional(),
  in_app: z.record(z.string().max(10000), z.boolean()).optional(),
});

export const updateTalentNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireTalentWritable])
  .inputValidator((input: unknown) => NotificationPrefsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: TablesUpdate<"talent_profiles"> = { expiry_notice_days: data.expiry_notice_days };
    if (data.in_app || data.in_app_enabled !== undefined) {
      patch.notification_prefs = {
        in_app_enabled: data.in_app_enabled !== false,
        in_app: { ...DEFAULT_IN_APP, ...(data.in_app ?? {}) },
        email: false,
      };
    }
    const { error } = await supabase.from("talent_profiles").update(patch).eq("user_id", userId);
    if (error) throw databaseError(error);
    return { ok: true, expiryNoticeDays: data.expiry_notice_days };
  });

/** True when the caller has in-app reminders switched on. */
async function inAppRemindersEnabled(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("talent_profiles")
    .select("notification_prefs")
    .eq("user_id", userId)
    .maybeSingle();
  return readNotificationPrefs(data?.notification_prefs).in_app_enabled !== false;
}

/**
 * Full reminder history — read and unread, dismissed or not. Nothing is ever
 * removed from this list, so clearing the bell never loses a reminder.
 */
export const listTalentNotifications = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        unread_only: z.boolean().default(false),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("talent_notifications")
      .select(
        "id, kind, title, detail, tone, target_type, target_id, due_at, read_at, dismissed_at, email_sent_at, created_at",
      )
      .eq("user_id", userId);
    if (data.unread_only) q = q.is("read_at", null);
    const { data: rows, error } = await q
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw databaseError(error);
    return rows ?? [];
  });

/** Bell feed: unread reminders plus the unread count, gated by the in-app preference. */
export const getTalentBellFeed = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const enabled = await inAppRemindersEnabled(supabase, userId);
    const none: Pick<
      Tables<"talent_notifications">,
      | "id"
      | "kind"
      | "title"
      | "detail"
      | "tone"
      | "target_type"
      | "target_id"
      | "due_at"
      | "created_at"
    >[] = [];
    if (!enabled) return { enabled: false, unreadCount: 0, items: none };
    const { data: rows } = await supabase
      .from("talent_notifications")
      .select("id, kind, title, detail, tone, target_type, target_id, due_at, created_at")
      .eq("user_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    const items = rows ?? [];
    return { enabled: true, unreadCount: items.length, items };
  });

export const markTalentNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), read: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("talent_notifications")
      .update({ read_at: data.read ? new Date().toISOString() : null })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw databaseError(error);
    return { ok: true };
  });

export const markAllTalentNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("talent_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw databaseError(error);
    return { ok: true };
  });

/**
 * Runs the reminder engine for the signed-in talent only (the pg_cron hook runs
 * it for everyone). Used by the dashboard so reminders appear without waiting
 * for the next scheduled pass.
 */
export const runMyReminderScan = createServerFn({ method: "POST" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { runTalentReminderScan } = await import("@/lib/talent-reminders.server");
    return runTalentReminderScan({ userId: context.userId });
  });

export const dismissTalentNotification = createServerFn({ method: "POST" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("talent_notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw databaseError(error);
    return { ok: true };
  });

const UpdateProfileInput = z.object({
  full_name: z.string().trim().min(1).max(160),
  talent_type: z.string().trim().max(80).nullable().optional(),
});

export const updateTalentProfile = createServerFn({ method: "POST" })
  .middleware([requireTalentWritable])
  .inputValidator((input: unknown) => UpdateProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error: pErr } = await supabase
      .from("talent_profiles")
      .update({ full_name: data.full_name })
      .eq("user_id", userId);
    if (pErr) throw databaseError(pErr);

    if (data.talent_type !== undefined) {
      await supabase
        .from("agency_talent_links")
        .update({
          display_name: data.full_name,
          talent_type: data.talent_type,
        })
        .eq("talent_user_id", userId);
    }
    return { ok: true };
  });

/**
 * Roster Shared Folder — read-only view for the talent.
 * Returns the folder list (as defined by the agency) plus all shared documents
 * belonging to the caller's active link.
 */
export const getRosterSharedContents = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((input: unknown) =>
    z.object({ link_id: z.string().uuid().optional() }).optional().parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;

    // Only links the portal shows (active, or ended with shared items) are
    // ever readable here — independent talent get nothing.
    const visible = await loadTalentLinks(supabase, userId);
    const chosen = input?.link_id ? visible.find((l) => l.id === input.link_id) : visible[0];
    const link = chosen
      ? {
          id: chosen.id,
          agency_id: chosen.agency_id,
          status: chosen.state === "active" ? "active" : "ended",
        }
      : null;

    if (!link) return { link: null, folders: [], documents: [], read_until: null as string | null };
    const readUntil = await linkReadUntil(link.id);
    const expired = !!readUntil && new Date(readUntil).getTime() <= Date.now();

    // Docs — talent-side SELECT policy already scopes by link
    const { data: docs, error: dErr } = await supabase
      .from("talent_shared_documents")
      .select(
        "id, name, folder, status, validity_expires_at, storage_path, uploaded_by, created_at, updated_at, locked_until, current_version_id, pending_review, validated_at, quarantine_reason",
      )
      .eq("talent_link_id", link.id)
      .order("created_at", { ascending: false });
    if (dErr) throw databaseError(dErr);

    // Folders — no talent-side RLS on agency_talent_folders. Use admin after
    // verifying the caller owns this link (already done above).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folders } = await supabaseAdmin
      .from("agency_talent_folders")
      .select("id, folder_name, sort_order, retention_years, parent_folder_id")
      .eq("talent_link_id", link.id)
      .order("sort_order", { ascending: true });
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("name")
      .eq("id", link.agency_id)
      .maybeSingle();

    return {
      link: {
        id: link.id,
        agency_id: link.agency_id,
        status: link.status,
        agency_name: ((agency?.name as string) ?? "").trim() || "your agency",
        state: chosen!.state,
      },
      // Ended relationship: only folders that hold something shared (plus
      // their category) — no empty agency folders.
      folders: expired
        ? []
        : chosen!.state === "previous"
          ? (() => {
              const used = new Set((docs ?? []).map((d) => d.folder));
              const keep = (folders ?? []).filter((f) => used.has(f.folder_name));
              const parents = new Set(keep.map((f) => f.parent_folder_id).filter(Boolean));
              return (folders ?? []).filter((f) => used.has(f.folder_name) || parents.has(f.id));
            })()
          : (folders ?? []),
      documents: docs ?? [],
      read_until: readUntil,
    };
  });

const DownloadInput = z.object({ document_id: z.string().uuid() });

export const getSharedDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((input: unknown) => DownloadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS ensures the caller can only SELECT their own shared docs.
    const { data: doc, error } = await supabase
      .from("talent_shared_documents")
      .select("id, name, storage_path, talent_link_id, validated_at, quarantine_reason")
      .eq("id", data.document_id)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!doc) throw new Error("Document not found.");
    assertNotQuarantined(doc);
    if (!doc.validated_at)
      throw new Error("This file is still being checked. Please try again shortly.");
    if (!doc.storage_path) throw new Error("No file attached to this document.");

    // Double-check ownership defensively.
    if (!doc.talent_link_id) throw new Error("Not authorised for this document.");
    const { data: link } = await supabase
      .from("agency_talent_links")
      .select("id")
      .eq("talent_user_id", userId)
      .eq("id", doc.talent_link_id)
      .maybeSingle();
    if (!link) throw new Error("Not authorised for this document.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("talent-documents")
      .createSignedUrl(doc.storage_path, 60 * 30, { download: doc.name });
    if (sErr) throw databaseError(sErr);
    return { url: signed.signedUrl, name: doc.name };
  });

// -----------------------------------------------------------------------------
// M4 (talent side) — Document Requests fulfillment
// -----------------------------------------------------------------------------

/** An ACTIVE link of the caller (requests only exist while linked). */
async function getCallerLink(supabase: SupabaseClient<Database>, userId: string, linkId?: string) {
  const active = (await loadTalentLinks(supabase, userId)).filter((l) => l.state === "active");
  const l = linkId ? active.find((x) => x.id === linkId) : active[0];
  return l ? { id: l.id, agency_id: l.agency_id, status: "active" } : null;
}

/**
 * Requests sent to the caller by their Manager, plus recent history.
 */
export const listTalentDocumentRequests = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((input: unknown) =>
    z.object({ link_id: z.string().uuid().optional() }).optional().parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;
    const link = await getCallerLink(supabase, userId, input?.link_id);
    if (!link) return { link: null, requests: [], history: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [reqRes, hisRes] = await Promise.all([
      supabaseAdmin
        .from("agency_document_requests")
        .select(
          "id, title, folder, instructions, status, due_date, reason_code, review_notes, reviewed_at, created_at, updated_at, current_document_id",
        )
        .eq("talent_link_id", link.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("agency_document_request_history")
        .select("id, request_id, event, document_id, reason_code, notes, created_at")
        .eq("agency_id", link.agency_id)
        .in(
          "request_id",
          (
            await supabaseAdmin
              .from("agency_document_requests")
              .select("id")
              .eq("talent_link_id", link.id)
          ).data?.map((r) => r.id) ?? ["00000000-0000-0000-0000-000000000000"],
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (reqRes.error) throw databaseError(reqRes.error);

    return {
      link: { id: link.id, agency_id: link.agency_id, status: link.status },
      requests: reqRes.data ?? [],
      history: hisRes.data ?? [],
    };
  });

const RequestUploadInput = z.object({
  request_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(240),
  mime_type: z.string().trim().max(120).optional(),
});

/**
 * Reserve a signed upload URL for a talent-side response file.
 * Storage path is scoped to the caller's link so admin bucket ops stay auditable.
 */
export const createTalentRequestUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireTalentWritable])
  .inputValidator((input: unknown) => RequestUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reqLink } = await (
      await import("@/integrations/supabase/client.server")
    ).supabaseAdmin
      .from("agency_document_requests")
      .select("talent_link_id")
      .eq("id", data.request_id)
      .maybeSingle();
    const link = reqLink?.talent_link_id
      ? await getCallerLink(supabase, userId, reqLink.talent_link_id as string)
      : null;
    if (!link)
      throw new Error("Requests can only be answered while you are linked to this agency.");
    if (await linkReadUntil(link.id)) throw new Error(READ_ONLY_MESSAGE);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("agency_document_requests")
      .select("id, agency_id, talent_link_id")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req || req.talent_link_id !== link.id) throw new Error("Request not found.");

    const safe = data.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `agency/${req.agency_id}/link/${link.id}/requests/${req.id}/${Date.now()}-${safe}`;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("talent-documents")
      .createSignedUploadUrl(path);
    if (error) throw databaseError(error);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

const SubmitRequestInput = z.object({
  request_id: z.string().uuid(),
  storage_path: z.string().max(10000).min(1),
  filename: z.string().min(1).max(240),
  size_bytes: z.number().int().nonnegative().optional(),
  mime_type: z.string().max(120).optional(),
});

/**
 * After the client uploads the file to the signed URL, register the file as a
 * shared document and mark the request submitted (agency reviews next).
 */
export const submitTalentDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireTalentWritable])
  .inputValidator((input: unknown) => SubmitRequestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reqLink } = await (
      await import("@/integrations/supabase/client.server")
    ).supabaseAdmin
      .from("agency_document_requests")
      .select("talent_link_id")
      .eq("id", data.request_id)
      .maybeSingle();
    const link = reqLink?.talent_link_id
      ? await getCallerLink(supabase, userId, reqLink.talent_link_id as string)
      : null;
    if (!link)
      throw new Error("Requests can only be answered while you are linked to this agency.");
    if (await linkReadUntil(link.id)) throw new Error(READ_ONLY_MESSAGE);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("agency_document_requests")
      .select("id, agency_id, talent_link_id, folder, title, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req || req.talent_link_id !== link.id) throw new Error("Request not found.");
    if (req.status === "completed" || req.status === "cancelled") {
      throw new Error("This request is closed.");
    }

    const expectedPrefix = `agency/${req.agency_id}/link/${link.id}/requests/${req.id}/`;
    if (!data.storage_path.startsWith(expectedPrefix) || data.storage_path.includes(".."))
      throw new Error("That file does not belong to this request.");
    const { validateStoredUpload } = await import("@/lib/file-validation.server");
    const checkedUpload = await validateStoredUpload({
      bucket: "talent-documents",
      path: data.storage_path,
      claimedMime: data.mime_type,
    });
    const { data: doc, error: dErr } = await supabaseAdmin
      .from("talent_shared_documents")
      .insert({
        agency_id: req.agency_id,
        talent_link_id: link.id,
        name: data.filename,
        folder: req.folder,
        status: "needs_review",
        storage_path: data.storage_path,
        uploaded_by: userId,
        validated_at: new Date().toISOString(),
        mime_type: checkedUpload.mimeType,
        size_bytes: checkedUpload.sizeBytes,
      })
      .select("id")
      .single();
    if (dErr) throw databaseError(dErr);

    // version row (v1) so agency-side history tools see the submission
    await supabaseAdmin.from("talent_shared_document_versions").insert({
      document_id: doc.id,
      version_number: 1,
      storage_path: data.storage_path,
      name: data.filename,
      size_bytes: checkedUpload.sizeBytes,
      mime_type: checkedUpload.mimeType,
      validated_at: new Date().toISOString(),
      uploaded_by: userId,
    });
    await supabaseAdmin
      .from("talent_shared_documents")
      .update({ current_version_id: null })
      .eq("id", doc.id); // trigger already refreshed locked_until

    const { error: uErr } = await supabaseAdmin
      .from("agency_document_requests")
      .update({
        status: "submitted",
        current_document_id: doc.id,
        reason_code: null,
        review_notes: null,
      })
      .eq("id", req.id);
    if (uErr) throw databaseError(uErr);

    await supabaseAdmin.from("agency_document_request_history").insert({
      request_id: req.id,
      agency_id: req.agency_id,
      event: "submitted",
      document_id: doc.id,
      actor_id: userId,
    });

    return { ok: true, document_id: doc.id };
  });

// -----------------------------------------------------------------------------
// Dashboard KPIs
// -----------------------------------------------------------------------------
export const getTalentDashboard = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: prefRow } = await supabase
      .from("talent_profiles")
      .select("expiry_notice_days")
      .eq("user_id", userId)
      .maybeSingle();
    const expiryNoticeDays = prefRow?.expiry_notice_days ?? 30;

    const links = await loadTalentLinks(supabase, userId);
    const activeIds = links.filter((l) => l.state === "active").map((l) => l.id);
    const visibleIds = links.map((l) => l.id);
    const link = activeIds.length ? { id: activeIds[0] } : null;

    const [privDocs, privFolders, sharesRes] = await Promise.all([
      supabase
        .from("talent_private_documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      // Top-level categories only — sub-folders would inflate the dashboard count.
      supabase
        .from("talent_private_folders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("parent_id", null)
        .is("removed_at", null),
      supabase
        .from("loved_one_shares")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString()),
    ]);
    const activeShares = sharesRes.count ?? 0;

    let sharedCount = 0;
    let sharedFolderCount = 0;
    let expiringCount = 0;
    let openRequests = 0;
    let resubRequests = 0;
    let pendingRequests = 0;
    let attention: {
      key: string;
      snapshot: number;
      type: "request" | "reminder";
      title: string;
      detail: string;
      tone: "amber" | "purple";
      notificationId?: string;
      targetType?: string | null;
      targetId?: string | null;
      requestId?: string;
      linkId?: string;
    }[] = [];
    const todoNotifIds = new Set<string>();

    if (link) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const expiryCutoff = new Date(Date.now() + expiryNoticeDays * 86400_000).toISOString();
      const [sc, sf, ec, or, rr, pr, reqRows] = await Promise.all([
        supabaseAdmin
          .from("talent_shared_documents")
          .select("id", { count: "exact", head: true })
          .in("talent_link_id", activeIds),
        supabaseAdmin
          .from("agency_talent_folders")
          .select("id", { count: "exact", head: true })
          .in("talent_link_id", activeIds),
        supabaseAdmin
          .from("talent_shared_documents")
          .select("id", { count: "exact", head: true })
          .in("talent_link_id", activeIds)
          .not("validity_expires_at", "is", null)
          .lt("validity_expires_at", expiryCutoff),
        supabaseAdmin
          .from("agency_document_requests")
          .select("id", { count: "exact", head: true })
          .in("talent_link_id", activeIds)
          .in("status", ["pending", "submitted"]),
        supabaseAdmin
          .from("agency_document_requests")
          .select("id", { count: "exact", head: true })
          .in("talent_link_id", activeIds)
          .eq("status", "resubmission_required"),
        supabaseAdmin
          .from("agency_document_requests")
          .select("id", { count: "exact", head: true })
          .in("talent_link_id", activeIds)
          .eq("status", "pending"),
        supabaseAdmin
          .from("agency_document_requests")
          .select("id, title, folder, status, due_date, updated_at, talent_link_id")
          .in("talent_link_id", activeIds)
          .in("status", ["pending", "resubmission_required"])
          .order("updated_at", { ascending: false })
          .limit(50),
      ]);
      sharedCount = sc.count ?? 0;
      sharedFolderCount = sf.count ?? 0;
      expiringCount = ec.count ?? 0;
      openRequests = or.count ?? 0;
      resubRequests = rr.count ?? 0;
      pendingRequests = pr.count ?? 0;

      const fmtDate = (v: string) =>
        new Date(v).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });

      // Expiring documents are intentionally not listed here — the bell
      // already carries them (count + per-document reminders). The dashboard
      // keeps the "Expiring soon" KPI count only.
      const items = [
        ...(reqRows.data ?? []).map((r) => ({
          key: `doc_request:${r.id}`,
          requestId: r.id as string,
          linkId: r.talent_link_id as string,
          snapshot: Math.floor(new Date(r.updated_at).getTime() / 1000),
          type: "request" as const,
          tone: (r.status === "resubmission_required" ? "amber" : "purple") as "amber" | "purple",
          title:
            r.status === "resubmission_required"
              ? `Resubmission requested: ${r.title}`
              : `Requested: ${r.title}`,
          detail: r.due_date
            ? `${r.folder} · due ${fmtDate(r.due_date)}`
            : `${r.folder} · no due date`,
        })),
      ];

      // Action items stay until done — they cannot be dismissed.
      attention = items;
    }

    // Reminder-engine notifications (Private Vault and shared-folder expiries,
    // share expiries). The in-app master switch gates both the scan and the feed.
    const inAppEnabled = await inAppRemindersEnabled(supabase, userId);
    let unreadNotifications = 0;
    if (inAppEnabled) {
      try {
        const { runTalentReminderScan } = await import("@/lib/talent-reminders.server");
        await runTalentReminderScan({ userId });
      } catch (e) {
        console.error("[talent reminder scan]", e instanceof Error ? e.message : undefined);
      }
      const { data: notifs } = await supabase
        .from("talent_notifications")
        .select(
          "id, kind, title, detail, tone, target_type, target_id, due_at, read_at, created_at",
        )
        .eq("user_id", userId)
        .is("dismissed_at", null)
        .order("due_at", { ascending: true })
        .limit(50);
      for (const n of notifs ?? []) {
        if (!n.read_at) unreadNotifications += 1;
        attention.push({
          key: `notification:${n.id}`,
          snapshot: Math.floor(new Date(n.created_at as string).getTime() / 1000),
          type: "reminder",
          title: n.title as string,
          detail: (n.detail as string) ?? "",
          tone: (n.tone === "purple" ? "purple" : "amber") as "amber" | "purple",
          notificationId: n.id as string,
          targetType: n.target_type as string | null,
          targetId: n.target_id as string | null,
        });
        if (n.kind === "doc_expiring") todoNotifIds.add(n.id as string);
      }
    } else {
      attention = [];
    }

    // "To do" = real actions only: document requests (pending/resubmission)
    // and document-expiry reminders, from the same feed/thresholds as the bell.
    // Security alerts and share expiries stay under the bell only.
    const todo = attention.filter(
      (a) => a.type === "request" || (a.notificationId && todoNotifIds.has(a.notificationId)),
    );

    // Manager name (named person on the link), recent documents, trusted contacts.
    let managerName: string | null = null;
    const recent: {
      id: string;
      name: string;
      folder: string;
      date: string;
      area: "private" | "shared";
      linkId?: string | null;
    }[] = [];
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (visibleIds.length) {
        const { data: l } = await supabaseAdmin
          .from("agency_talent_links")
          .select("manager_user_id")
          .eq("id", activeIds[0] ?? "00000000-0000-0000-0000-000000000000")
          .maybeSingle();
        if (l?.manager_user_id) {
          const { data: p } = await supabaseAdmin
            .from("profiles")
            .select("display_name, first_name, last_name, email")
            .eq("id", l.manager_user_id)
            .maybeSingle();
          managerName = profileName(p);
        }
        const { data: sd } = await supabaseAdmin
          .from("talent_shared_documents")
          .select("id, name, folder, created_at, talent_link_id")
          .in("talent_link_id", visibleIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(4);
        for (const d of sd ?? [])
          recent.push({
            id: d.id,
            name: d.name,
            folder: d.folder,
            date: d.created_at,
            area: "shared",
            linkId: d.talent_link_id,
          });
      }
      const { data: pd } = await supabase
        .from("talent_private_documents")
        .select("id, name, created_at, folder_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(4);
      const folderIds = [
        ...new Set((pd ?? []).map((d) => d.folder_id).filter(Boolean)),
      ] as string[];
      const folderNames = new Map<string, string>();
      if (folderIds.length) {
        const { data: fs } = await supabase
          .from("talent_private_folders")
          .select("id, name")
          .in("id", folderIds);
        for (const f of fs ?? []) folderNames.set(f.id, f.name);
      }
      for (const d of pd ?? [])
        recent.push({
          id: d.id,
          name: d.name,
          folder: (d.folder_id && folderNames.get(d.folder_id)) || "Unfiled",
          date: d.created_at,
          area: "private",
        });
      recent.sort((a, b) => b.date.localeCompare(a.date));
    }

    const { data: contactRows } = await supabase
      .from("loved_one_shares")
      .select("id, loved_one_name, relationship, expires_at, scope")
      .eq("talent_id", userId)
      .eq("is_active", true)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(5);

    return {
      hasLink: !!link,
      links,
      managerName,
      recentDocs: recent.slice(0, 4),
      trustedContacts: (contactRows ?? []).map((c) => {
        const scope = (c.scope ?? {}) as {
          private_folder_ids?: string[];
          private_document_ids?: string[];
        };
        return {
          id: c.id as string,
          name: c.loved_one_name as string,
          relationship: (c.relationship as string | null) ?? null,
          expiresAt: c.expires_at as string | null,
          sharedDocs: scope.private_document_ids?.length ?? 0,
        };
      }),
      todo,
      privateDocs: privDocs.count ?? 0,
      activeShares,
      privateFolders: privFolders.count ?? 0,
      sharedDocs: sharedCount,
      sharedFolders: sharedFolderCount,

      expiringSoon: expiringCount,
      expiryNoticeDays,
      openRequests,
      resubRequests,
      pendingRequests,
      actionRequests: pendingRequests + resubRequests,
      inAppEnabled,
      unreadNotifications,
      attention,
    };
  });

// -----------------------------------------------------------------------------
// Bell reminder dismissals (per-user, re-surface when the underlying count changes)
// -----------------------------------------------------------------------------
export const listTalentDismissals = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("talent_notification_dismissals")
      .select("kind, snapshot")
      .eq("user_id", userId);
    return (data ?? []) as { kind: string; snapshot: number }[];
  });

export const dismissTalentReminder = createServerFn({ method: "POST" })
  .middleware([requireTalentTermsAccepted])
  .inputValidator((d: unknown) =>
    z
      .object({ kind: z.string().min(1).max(60), snapshot: z.number().int().nonnegative() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("talent_notification_dismissals").upsert(
      {
        user_id: userId,
        kind: data.kind,
        snapshot: data.snapshot,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,kind" },
    );
    if (error) throw databaseError(error);
    return { ok: true };
  });

/**
 * Read-only view of the quotes and invoices the talent's Manager has shared
 * with them. Billing documents carry no talent foreign key yet — they record a
 * typed talent name — so we match on the linked roster display name within the
 * talent's own agency, and only ever return documents explicitly marked as
 * shared with the talent. Talents have no RLS read on billing, so the admin
 * client is used strictly after the caller's own link has been resolved.
 */
export const listTalentBillingDocuments = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: links } = await supabase
      .from("agency_talent_links")
      .select("id, agency_id, display_name, status")
      .eq("talent_user_id", userId)
      .neq("status", "invited")
      .order("created_at", { ascending: true });
    // Ended links stay readable only until their fixed post-end cut-off.
    const myLinks: Array<{
      id: string;
      agency_id: string;
      display_name: string;
      status: string;
      read_until: string | null;
    }> = [];
    for (const l of (links ?? []) as Array<{
      id: string;
      agency_id: string;
      display_name: string;
      status: string;
    }>) {
      const readUntil = await linkReadUntil(l.id);
      if (!billingLinkReadable({ ...l, read_until: readUntil })) continue;
      myLinks.push({ ...l, read_until: readUntil });
    }
    const link = myLinks[0] ?? null;

    if (!link) return { link: null, documents: [], unshared_count: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const COLS =
      "id, agency_id, talent_link_id, kind, number, client_name, talent_name, issued_at, due_date, paid_at, sent_at, accepted_at, currency, total_cents, status, description";

    // Billing access is always linked by immutable roster ID, never a name.
    const fetchFor = async (shared: boolean) => {
      const linkIds = myLinks.map((l) => l.id);
      const { data: direct, error } = await supabaseAdmin
        .from("agency_billing_docs")
        .select(COLS)
        .in("talent_link_id", linkIds)
        .eq("shared_with_talent", shared);
      if (error) throw databaseError(error);
      const out = new Map<string, NonNullable<typeof direct>[number]>();
      for (const d of direct ?? []) if (billingDocumentBelongsToLinks(d, myLinks)) out.set(d.id, d);
      return Array.from(out.values()).sort((x, y) =>
        String(y.issued_at).localeCompare(String(x.issued_at)),
      );
    };
    const docs = await fetchFor(true);
    const unsharedCount = (await fetchFor(false)).length;
    const rows = docs ?? [];

    // Amounts actually received, so partially paid invoices read honestly.
    const ids = rows.filter((r) => r.kind === "invoice").map((r) => r.id);
    const received = new Map<string, number>();
    if (ids.length) {
      const { data: payments } = await supabaseAdmin
        .from("agency_invoice_payments")
        .select("doc_id, amount_cents")
        .in("doc_id", ids);
      for (const p of payments ?? []) {
        received.set(p.doc_id, (received.get(p.doc_id) ?? 0) + Number(p.amount_cents));
      }
    }

    return {
      link: { id: link.id, display_name: link.display_name, read_until: link.read_until },
      unshared_count: unsharedCount ?? 0,
      documents: rows.map((r) => ({
        ...r,
        received_cents: received.get(r.id) ?? 0,
        outstanding_cents:
          r.kind === "invoice" ? Math.max(0, Number(r.total_cents) - (received.get(r.id) ?? 0)) : 0,
      })),
    };
  });

/**
 * Settings › Agency relationship. One entry per agency the portal shows
 * (active, or ended with shared items). Talent have no RLS read on agencies,
 * so only the contact fields listed here are read with the service role, and
 * only for links loadTalentLinks has already confirmed belong to the caller.
 */
export const getTalentAgencyLinks = createServerFn({ method: "GET" })
  .middleware([requireTalentTermsAccepted])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const links = await loadTalentLinks(supabase, userId);
    const { data: reqs } = await supabase.rpc("my_link_requests");
    const pendingConnectionRequests = (reqs ?? []).length;
    if (links.length === 0)
      return { relationships: [], hasActiveLink: false, pendingConnectionRequests };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: linkRows, error: e1 }, { data: agencies, error: e2 }] = await Promise.all([
      supabaseAdmin
        .from("agency_talent_links")
        .select("id, manager_user_id, created_at, responded_at, ended_at")
        .in(
          "id",
          links.map((l) => l.id),
        ),
      supabaseAdmin
        .from("agencies")
        .select("id, name, logo_path, contact_email, phone")
        .in(
          "id",
          links.map((l) => l.agency_id),
        ),
    ]);
    if (e1 || e2)
      throw new Error("We couldn't load your agency details. Please refresh and try again.");
    const managerIds = [
      ...new Set((linkRows ?? []).map((r) => r.manager_user_id).filter((v): v is string => !!v)),
    ];
    const { data: managers } = managerIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, display_name, first_name, last_name, email, phone")
          .in("id", managerIds)
      : { data: null };
    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const out = [];
    for (const l of links) {
      const row = (linkRows ?? []).find((r) => r.id === l.id);
      const a = (agencies ?? []).find((x) => x.id === l.agency_id);
      const m = (managers ?? []).find((x) => x.id === row?.manager_user_id);
      let logoUrl: string | null = null;
      if (a?.logo_path) {
        const { data: signed } = await supabaseAdmin.storage
          .from("agency-branding")
          .createSignedUrl(a.logo_path, 3600);
        logoUrl = signed?.signedUrl ?? null;
      }
      const managerName = m
        ? clean(m.display_name) || clean([m.first_name, m.last_name].filter(Boolean).join(" "))
        : null;
      out.push({
        linkId: l.id,
        state: l.state,
        agencyName: l.agency_name,
        logoUrl,
        agencyEmail: clean(a?.contact_email),
        agencyPhone: clean(a?.phone),
        manager: m ? { name: managerName, email: clean(m.email), phone: clean(m.phone) } : null,
        linkedSince: row?.responded_at ?? row?.created_at ?? null,
        endedAt: row?.ended_at ?? null,
        sharedDocs: l.shared_docs,
      });
    }
    return {
      relationships: out,
      hasActiveLink: out.some((r) => r.state === "active"),
      pendingConnectionRequests,
    };
  });

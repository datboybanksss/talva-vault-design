import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "talent-private-documents";

/**
 * Streams a shared document to a Loved One through our own origin.
 *
 * The storage path and any signed storage URL are never exposed to the browser,
 * so "view only" cannot be bypassed by grabbing the underlying file URL.
 */
export const Route = createFileRoute("/api/public/loved-one-file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const docId = url.searchParams.get("doc") ?? "";
        const ticket = url.searchParams.get("ticket") ?? undefined;
        const mode = url.searchParams.get("mode") === "download" ? "download" : "view";

        if (!token || !docId) return new Response("Bad request", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyTicket } = await import("@/lib/loved-one-access.server");

        const { data: share } = await supabaseAdmin
          .from("loved_one_shares")
          .select("id, scope, created_by, expires_at, revoked_at, is_active, locked_at, access_code_hash, permission")
          .eq("token", token)
          .maybeSingle();

        if (!share) return new Response("Not found", { status: 404 });
        if (share.revoked_at || share.is_active === false || share.locked_at) {
          return new Response("Access revoked", { status: 403 });
        }
        if (new Date(share.expires_at).getTime() < Date.now()) {
          return new Response("Link expired", { status: 403 });
        }
        if (share.access_code_hash && !verifyTicket(ticket, share.id)) {
          return new Response("Access code required", { status: 401 });
        }
        if (mode === "download" && share.permission !== "download") {
          return new Response("This share is view-only", { status: 403 });
        }

        const { data: doc } = await supabaseAdmin
          .from("talent_private_documents")
          .select("id, name, folder_id, storage_path, user_id, mime_type")
          .eq("id", docId)
          .maybeSingle();
        if (!doc || !doc.storage_path) return new Response("Not found", { status: 404 });
        if (doc.user_id !== share.created_by) return new Response("Forbidden", { status: 403 });

        const folderIds: string[] = (share.scope as any)?.private_folder_ids ?? [];
        const docIds: string[] = (share.scope as any)?.private_document_ids ?? [];
        const inScope = docIds.includes(doc.id) || (doc.folder_id != null && folderIds.includes(doc.folder_id));
        if (!inScope) return new Response("Forbidden", { status: 403 });

        const { data: file, error } = await supabaseAdmin.storage.from(BUCKET).download(doc.storage_path);
        if (error || !file) return new Response("File unavailable", { status: 404 });

        const safeName = doc.name.replace(/["\\\r\n]/g, "_");
        return new Response(file.stream(), {
          headers: {
            "Content-Type": doc.mime_type || "application/octet-stream",
            "Content-Disposition":
              mode === "download"
                ? `attachment; filename="${safeName}"`
                : `inline; filename="${safeName}"`,
            "Cache-Control": "private, no-store, max-age=0",
            "X-Robots-Tag": "noindex, nofollow",
          },
        });
      },
    },
  },
});

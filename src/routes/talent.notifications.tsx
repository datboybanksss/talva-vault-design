import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, BellOff, Check, CheckCheck, Clock, Mail, MailX } from "lucide-react";
import {
  listTalentNotifications,
  markTalentNotificationRead,
  markAllTalentNotificationsRead,
} from "@/lib/talent.functions";
import { PAGE_SIZE } from "@/lib/pagination";
import { LoadMoreRow } from "@/components/shared/load-more";

export const Route = createFileRoute("/talent/notifications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "All reminders · TalVault Talent" },
      {
        name: "description",
        content: "Every reminder TalVault has raised for you — expiring documents, shared access and new sign-ins.",
      },
    ],
  }),
  component: NotificationsPage,
});

const fmt = (v: string) =>
  new Date(v).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function NotificationsPage() {
  const listFn = useServerFn(listTalentNotifications);
  const markFn = useServerFn(markTalentNotificationRead);
  const markAllFn = useServerFn(markAllTalentNotificationsRead);
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const q = useInfiniteQuery({
    queryKey: ["talent", "notifications", unreadOnly],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listFn({
        data: { limit: PAGE_SIZE, offset: pageParam as number, unread_only: unreadOnly },
      }) as Promise<any[]>,
    getNextPageParam: (last, all) =>
      last.length < PAGE_SIZE ? undefined : all.reduce((n, p) => n + p.length, 0),
  });
  const rows: any[] = (q.data?.pages ?? []).flat();
  const unread = rows.filter((r) => !r.read_at).length;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["talent", "notifications"] });
    await qc.invalidateQueries({ queryKey: ["talent", "bell-feed"] });
    await qc.invalidateQueries({ queryKey: ["talent", "dashboard"] });
  }

  async function toggleRead(row: any) {
    try {
      await markFn({ data: { id: row.id, read: !row.read_at } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update this reminder");
    }
  }

  async function markAll() {
    try {
      await markAllFn();
      toast.success("All reminders marked as read");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark reminders as read");
    }
  }

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">All reminders</h1>
          <div className="tvp-subtitle">
            Everything TalVault has flagged for you — expiring documents, shared access and new sign-ins.
            Clearing the bell marks a reminder as read; nothing is removed from this list.
          </div>
        </div>
        <div className="tvp-actions">
          <button
            className="tvp-secondary"
            onClick={() => setUnreadOnly((v) => !v)}
            title={unreadOnly ? "Show every reminder" : "Show unread only"}
          >
            {unreadOnly ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {unreadOnly ? "Show all" : "Unread only"}
          </button>
          <button className="tvp-primary" onClick={markAll} disabled={unread === 0}>
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </button>
        </div>
      </div>

      <div className="tvp-card tvp-panel">
        <div className="tvp-panel-head">
          <div>
            <h2 className="tvp-h2">Reminder history</h2>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {rows.length} reminder{rows.length === 1 ? "" : "s"} shown · {unread} unread
            </p>
          </div>
        </div>

        <div className="tvp-table-wrap" style={{ marginTop: 12 }}>
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Reminder</th>
                <th>Raised</th>
                <th>Due</th>
                <th>Email</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isPending && (
                <tr><td colSpan={6} className="tvp-muted">Loading reminders…</td></tr>
              )}
              {!q.isPending && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="tvp-muted">
                    {unreadOnly
                      ? "No unread reminders — you're all caught up."
                      : "No reminders yet. Expiring documents, shared access and new sign-ins appear here."}
                  </td>
                </tr>
              )}
              {rows.map((n) => (
                <tr key={n.id} style={{ fontWeight: n.read_at ? 400 : 600 }}>
                  <td>
                    <strong>{n.title}</strong>
                    {n.detail && (
                      <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2, fontWeight: 400 }}>
                        {n.detail}
                      </div>
                    )}
                  </td>
                  <td className="tvp-muted">{fmt(n.created_at)}</td>
                  <td className="tvp-muted">
                    {n.due_at ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Clock className="h-3 w-3" /> {new Date(n.due_at).toLocaleDateString("en-GB")}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tvp-muted" title={n.email_sent_at ? "Emailed to you" : "Not emailed"}>
                    {n.email_sent_at ? <Mail className="h-3.5 w-3.5" /> : <MailX className="h-3.5 w-3.5" />}
                  </td>
                  <td>
                    <span className={`tvp-status tvp-${n.read_at ? "neutral" : (n.tone === "purple" ? "purple" : "amber")}`}>
                      {n.read_at ? "Read" : "Unread"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="tvp-mini-btn"
                      onClick={() => toggleRead(n)}
                      title={n.read_at ? "Mark as unread" : "Mark as read"}
                      aria-label={n.read_at ? "Mark as unread" : "Mark as read"}
                    >
                      {n.read_at ? <Bell className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
              <LoadMoreRow
                colSpan={6}
                noun="reminders"
                shown={rows.length}
                hasMore={!!q.hasNextPage}
                loading={q.isFetchingNextPage}
                onLoadMore={() => q.fetchNextPage()}
              />
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

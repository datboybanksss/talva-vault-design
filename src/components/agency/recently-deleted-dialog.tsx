import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw, X } from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";
import { fmtLongDate } from "@/lib/document-blocks";
import { listRecentlyDeletedDocuments, restoreDeletedDocument } from "@/lib/agency.functions";

export type DeletedRow = {
  id: string;
  name: string;
  folder: string | null;
  talent_name: string | null;
  deleted_at: string;
  deleted_by_email: string | null;
  purge_after: string | null;
  shared_with_talent: boolean;
};

/** Recently deleted list with Restore — shared by the agency owner and Admin views. */
export function RecentlyDeletedList({
  queryKey,
  load,
  restore,
}: {
  queryKey: unknown[];
  load: () => Promise<DeletedRow[]>;
  restore: (id: string) => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({ queryKey, queryFn: load });
  const restoreMut = useMutation({
    mutationFn: restore,
    onSuccess: () => {
      toast.success("Document restored");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["agency", "vault"] });
    },
    onError: (e) => toast.error(friendlyError(e, "This document couldn't be restored.")),
  });

  if (isLoading) return <p className="tvp-muted">Loading…</p>;
  if (rows.length === 0) return <p className="tvp-muted">Nothing has been deleted recently.</p>;
  return (
    <table className="tvp-table">
      <thead>
        <tr>
          <th>Document</th>
          <th>Talent</th>
          <th>Deleted</th>
          <th>Removed permanently</th>
          <th style={{ width: 120 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <strong>{r.name}</strong>
              <div className="tvp-muted">{r.folder ?? "—"}</div>
            </td>
            <td>{r.talent_name ?? "—"}</td>
            <td className="tvp-muted">
              {fmtLongDate(r.deleted_at)}
              {r.deleted_by_email ? ` · ${r.deleted_by_email}` : ""}
            </td>
            <td className="tvp-muted">
              {r.purge_after ? fmtLongDate(r.purge_after) : "Recovery period not set yet"}
              {r.shared_with_talent ? <div>The talent keeps access</div> : null}
            </td>
            <td>
              <button
                className="tvp-secondary"
                disabled={restoreMut.isPending}
                onClick={() => restoreMut.mutate(r.id)}
              >
                <RotateCcw className="h-4 w-4" /> Restore
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RecentlyDeletedDialog({ onClose }: { onClose: () => void }) {
  const listFn = useServerFn(listRecentlyDeletedDocuments);
  const restoreFn = useServerFn(restoreDeletedDocument);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        className="tvp-card"
        role="dialog"
        aria-label="Recently deleted"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(900px, 100%)", padding: "var(--sp-24)" }}
      >
        <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-16)" }}>
          <h2 className="tvp-h2">Recently deleted</h2>
          <button className="tvp-mini-btn" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="tvp-muted" style={{ marginBottom: "var(--sp-16)" }}>
          Deleted documents stay here until their recovery period ends. Anything already shared with
          a talent stays available to them.
        </p>
        <RecentlyDeletedList
          queryKey={["agency", "recently-deleted"]}
          load={async () => (await listFn()).rows as DeletedRow[]}
          restore={(id) => restoreFn({ data: { id } })}
        />
      </div>
    </div>
  );
}

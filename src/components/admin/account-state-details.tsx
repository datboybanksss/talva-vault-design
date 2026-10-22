import { PAUSE_REASONS, SUSPEND_REASONS } from "@/lib/account-state";

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB") : "—");
const label = (map: Record<string, string>, v?: string | null) => (v ? (map[v] ?? v) : "—");

/** Admin-only pause/suspension details for an agency or talent record. */
export function AccountStateDetails({ row, suspended }: { row: any; suspended: boolean }) {
  return (
    <>
      {row.paused_at && (
        <>
          <p style={{ marginTop: 10 }}>
            <strong>Paused</strong>
            <br />
            {fmt(row.paused_at)} · {label(PAUSE_REASONS, row.pause_reason)}
          </p>
          {row.pause_note && (
            <p style={{ marginTop: 10 }}>
              <strong>Pause note</strong>
              <br />
              {row.pause_note}
            </p>
          )}
        </>
      )}
      {suspended && (
        <>
          <p style={{ marginTop: 10 }}>
            <strong>Suspended</strong>
            <br />
            {fmt(row.suspended_at)} · {label(SUSPEND_REASONS, row.suspension_reason)}
          </p>
          {row.suspension_note && (
            <p style={{ marginTop: 10 }}>
              <strong>Suspension note</strong>
              <br />
              {row.suspension_note}
            </p>
          )}
        </>
      )}
    </>
  );
}

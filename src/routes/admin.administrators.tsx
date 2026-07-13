import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, CheckCircle2, ShieldCheck, KeyRound } from "lucide-react";
import {
  listAdministrators,
  whoami,
  listLegalCopyItems,
  markLegalCopyApproved,
  logOwnPasswordChange,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/password-input";
import {
  MIN_PW_LENGTH,
  scorePassword,
  validateNewPassword,
  friendlyAuthError,
} from "@/lib/password";

export const Route = createFileRoute("/admin/administrators")({
  head: () => ({ meta: [{ title: "Administrators · TalVault Admin" }] }),
  component: AdminsPage,
});

function AdminsPage() {
  const listFn = useServerFn(listAdministrators);
  const whoamiFn = useServerFn(whoami);
  const listLegalFn = useServerFn(listLegalCopyItems);
  const approveLegalFn = useServerFn(markLegalCopyApproved);
  const qc = useQueryClient();

  const admins = useQuery({
    queryKey: ["admin", "administrators"],
    queryFn: () => listFn(),
  });
  const me = useQuery({ queryKey: ["whoami"], queryFn: () => whoamiFn() });
  const legal = useQuery({
    queryKey: ["admin", "legal"],
    queryFn: () => listLegalFn(),
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveLegalFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Legal / copy item approved.");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const [tab, setTab] = useState<"admins" | "legal">("admins");

  const list = admins.data ?? [];
  const stats = useMemo(() => {
    return {
      total: list.length,
      main: list.filter((a: any) => a.is_main_admin).length,
    };
  }, [list]);

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Administrators & Legal Review</h1>
          <div className="tvp-subtitle">
            Platform administrators and legal / copy review items (bell reminders).
          </div>
        </div>
      </div>

      <div className="tvp-grid tvp-kpi-grid">
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-teal"><Users className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.total}</div>
            <div className="tvp-kpi-label">Total Administrators</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-purple"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">{stats.main}</div>
            <div className="tvp-kpi-label">Main Administrators</div>
          </div>
        </div>
        <div className="tvp-card tvp-kpi">
          <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
          <div>
            <div className="tvp-kpi-value">
              {(legal.data ?? []).filter((l: any) => l.status === "approved").length}
            </div>
            <div className="tvp-kpi-label">Approved Legal / Copy Items</div>
          </div>
        </div>
      </div>

      <div className="tvp-tabs">
        <button
          className={`tvp-tab${tab === "admins" ? " tvp-active" : ""}`}
          onClick={() => setTab("admins")}
        >
          Administrators
        </button>
        <button
          className={`tvp-tab${tab === "legal" ? " tvp-active" : ""}`}
          onClick={() => setTab("legal")}
        >
          Legal & Copy Review
          <span className={`tvp-status tvp-amber`}>
            {(legal.data ?? []).filter((l: any) => l.status !== "approved").length}
          </span>
        </button>
      </div>

      {tab === "admins" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Administrators</h2>
          </div>
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Administrator</th><th>Email</th><th>Role</th><th>Granted</th>
              </tr>
            </thead>
            <tbody>
              {admins.isLoading && (
                <tr><td colSpan={4} className="tvp-muted">Loading…</td></tr>
              )}
              {list.map((a: any) => (
                <tr key={a.user_id}>
                  <td>
                    <strong>{a.display_name || a.email.split("@")[0]}</strong>
                    {a.user_id === me.data?.userId && (
                      <span
                        className="tvp-status tvp-blue"
                        style={{ marginLeft: 8, padding: "3px 7px", fontSize: 10 }}
                      >
                        You
                      </span>
                    )}
                  </td>
                  <td>{a.email}</td>
                  <td>
                    <span
                      className={`tvp-status tvp-${a.is_main_admin ? "purple" : "blue"}`}
                    >
                      {a.is_main_admin ? "Main Administrator" : "Administrator"}
                    </span>
                  </td>
                  <td>
                    {new Date(a.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "admins" && me.data?.email && (
        <ChangeOwnPasswordCard email={me.data.email} />
      )}

      {tab === "legal" && (
        <div className="tvp-card">
          <div className="tvp-toolbar">
            <h2 className="tvp-h2">Legal & Copy Review</h2>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              T&Cs, disclaimers and system copy. Placeholder items appear in the bell until approved.
            </span>
          </div>
          <table className="tvp-table">
            <thead>
              <tr>
                <th>Item</th><th>Status</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(legal.data ?? []).length === 0 && !legal.isLoading && (
                <tr><td colSpan={4} className="tvp-muted">No legal / copy items configured yet.</td></tr>
              )}
              {(legal.data ?? []).map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.title}</strong>
                    {l.body && (
                      <>
                        <br />
                        <span className="tvp-muted" style={{ fontSize: 12 }}>{l.body}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <span
                      className={`tvp-status tvp-${
                        l.status === "approved"
                          ? "green"
                          : l.status === "in_review"
                            ? "amber"
                            : "red"
                      }`}
                    >
                      {l.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    {new Date(l.updated_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td>
                    {l.status !== "approved" && (
                      <button
                        className="tvp-secondary"
                        onClick={() => approve.mutate(l.id)}
                        disabled={approve.isPending}
                      >
                        Mark approved
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ChangeOwnPasswordCard({ email }: { email: string }) {
  const logChangeFn = useServerFn(logOwnPasswordChange);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(next), [next]);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!current) {
      setError("Enter your current password to confirm the change.");
      return;
    }
    const v = validateNewPassword(next);
    if (v) {
      setError(v);
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (next === current) {
      setError("New password must be different from your current password.");
      return;
    }

    setBusy(true);
    try {
      // 1. Verify the current password by re-authenticating. This does not
      //    disturb the existing session — Supabase returns the same user.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInErr) {
        throw new Error("Current password is incorrect.");
      }

      // 2. Update to the new password. Supabase enforces its own policy here,
      //    including the HIBP breach check when enabled.
      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) throw updErr;

      // 3. Audit event (no password material sent or logged).
      await logChangeFn();

      setInfo("Password updated. Use your new password next time you sign in.");
      toast.success("Password updated.");
      reset();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tvp-card" style={{ marginTop: 18, maxWidth: 560 }}>
      <div className="tvp-toolbar" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          className="tvp-kpi-icon tvp-bg-teal"
          style={{ width: 32, height: 32 }}
        >
          <KeyRound className="h-4 w-4" />
        </div>
        <div>
          <h2 className="tvp-h2" style={{ margin: 0 }}>Change your password</h2>
          <div className="tvp-muted" style={{ fontSize: 12 }}>
            Updates the password for <strong>{email}</strong>. This only changes
            your own credentials.
          </div>
        </div>
      </div>

      <form onSubmit={submit} noValidate style={{ marginTop: 12 }}>
        <div className="tv-auth-field">
          <label htmlFor="pw-current">Current password</label>
          <PasswordInput
            id="pw-current"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            placeholder="Your current password"
            minLength={1}
          />
        </div>

        <div className="tv-auth-field" style={{ marginTop: 12 }}>
          <label htmlFor="pw-new">New password</label>
          <PasswordInput
            id="pw-new"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PW_LENGTH} characters`}
            minLength={MIN_PW_LENGTH}
          />
          <div className="tv-auth-hint">
            Minimum {MIN_PW_LENGTH} characters. No forced complexity — length
            &amp; unpredictability beat symbol-soup. Breached passwords are
            rejected automatically.
          </div>
          {next.length > 0 && (
            <div className="tv-auth-strength" aria-live="polite">
              <div className="tv-auth-strength-bar">
                <div
                  className="tv-auth-strength-fill"
                  style={{ width: `${strength.pct}%`, background: strength.color }}
                />
              </div>
              <div className="tv-auth-strength-row">
                <span className="tv-auth-strength-label">Strength</span>
                <span className={`tv-auth-strength-value ${strength.tier}`}>
                  {strength.label}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="tv-auth-field" style={{ marginTop: 12 }}>
          <label htmlFor="pw-confirm">Confirm new password</label>
          <PasswordInput
            id="pw-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Re-enter new password"
            minLength={MIN_PW_LENGTH}
          />
        </div>

        {error && (
          <div
            style={{
              marginTop: 14, padding: "10px 12px", borderRadius: 10,
              background: "var(--red-bg)", color: "var(--red)",
              border: "1px solid color-mix(in oklab, var(--red) 20%, transparent)",
              fontSize: 12.5, fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}
        {info && (
          <div
            style={{
              marginTop: 14, padding: "10px 12px", borderRadius: 10,
              background: "var(--teal-50)", color: "var(--teal)",
              border: "1px solid var(--teal-200)",
              fontSize: 12.5, fontWeight: 700,
            }}
          >
            {info}
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button type="submit" className="tvp-primary" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
          <button
            type="button"
            className="tvp-secondary"
            onClick={reset}
            disabled={busy}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

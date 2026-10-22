import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getTalentAccountById, setAccountTest, whoami } from "@/lib/admin.functions";
import { useSessionReady } from "@/hooks/use-session-ready";
import { useAccountStateActions } from "@/components/admin/account-state-actions";
import { AccountStateDetails } from "@/components/admin/account-state-details";
import { accountStateActions, ACCOUNT_ACTION_LABEL } from "@/lib/account-state";
import { accountStatusLabel, accountStatusPill } from "@/lib/account-filters";
import { statusLabel } from "@/lib/status-labels";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/admin/talent/$id")({
  head: () => ({
    meta: [
      { title: "Talent account · TalVault Admin" },
      { name: "description", content: "A talent account's status, agency links and admin actions." },
      { property: "og:title", content: "Talent account · TalVault Admin" },
      { property: "og:description", content: "A talent account's status, agency links and admin actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TalentAccountPage,
});

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function TalentAccountPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getTalentAccountById);
  const whoamiFn = useServerFn(whoami);
  const setTestFn = useServerFn(setAccountTest);
  const sessionReady = useSessionReady();
  const qc = useQueryClient();
  const accountState = useAccountStateActions();
  const q = useQuery({ queryKey: ["admin", "talent-account", id], queryFn: () => getFn({ data: { id } }) });
  const me = useQuery({ queryKey: ["whoami"], queryFn: () => whoamiFn(), enabled: sessionReady, retry: false });
  const canEdit = !!me.data?.canEdit;
  const t = q.data as any;
  const testM = useMutation({
    mutationFn: (isTest: boolean) => setTestFn({ data: { type: "talent", id, isTest } }),
    onSuccess: (_r, isTest) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(isTest ? "Marked as a test account and logged." : "Marked as a real account and logged.");
    },
    onError: (e) => toast.error(friendlyError(e, "We couldn't change the account type.")),
  });
  const name = t ? t.full_name || t.email || "Unnamed talent" : "";
  const state = t ? { paused: !!t.paused_at, suspended: !!t.suspended_at } : { paused: false, suspended: false };

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <Link to="/admin/accounts" search={{ type: "talent" }} className="tvp-link tvp-back-link">
            <ArrowLeft className="h-3 w-3" /> Back to accounts
          </Link>
          <h1 className="tvp-h1">{t ? name : q.isLoading ? "Loading…" : "Talent not found"}</h1>
          {t && (
            <div className="tvp-subtitle" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className={accountStatusPill("talent", t.status)}>{accountStatusLabel("talent", t.status)}</span>
              {t.is_test && <span className="tvp-status st-neutral">Test</span>}
              {t.email}
            </div>
          )}
        </div>
        {t && (
          <div className="tvp-actions">
            <button
              className="tvp-secondary"
              disabled={!canEdit || testM.isPending}
              onClick={() => {
                const next = !t.is_test;
                const msg = next
                  ? `Mark ${name} as a test account? It will be left out of reports and launch offer places by default.`
                  : `Mark ${name} as a real account? It will be counted in reports again.`;
                if (confirm(msg)) testM.mutate(next);
              }}
            >
              {t.is_test ? "Mark as real account" : "Mark as test account"}
            </button>
            {accountStateActions(state, true).map((action) => (
              <button
                key={action}
                className="tvp-secondary"
                disabled={!canEdit}
                title={canEdit ? undefined : "You need full edit access to pause or suspend an account."}
                onClick={() => accountState.openAction({ type: "talent", id: t.id, name, ...state }, action)}
              >
                {ACCOUNT_ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        )}
      </div>

      {t && (
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Talent details</h2>
          <div className="tvp-form-layout">
            <div>
              <p>
                <strong>Email</strong>
                <br />
                {t.email ?? "—"}
              </p>
              <p style={{ marginTop: 10 }}>
                <strong>Joined</strong>
                <br />
                {fmtDate(t.activation_completed_at ?? t.created_at)}
              </p>
              <p style={{ marginTop: 10 }}>
                <strong>Agencies</strong>
                <br />
                {t.agencies.length === 0
                  ? "Independent"
                  : t.agencies.map((l: any) => `${l.name} (${statusLabel("talentLink", l.status)})`).join(", ")}
              </p>
            </div>
            <div>
              <AccountStateDetails row={t} suspended={!!t.suspended_at} />
            </div>
          </div>
        </div>
      )}
      {accountState.dialog}
    </>
  );
}

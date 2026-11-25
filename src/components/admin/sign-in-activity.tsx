import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  signInCoverage,
  signInContext,
  SIGN_IN_TYPE_LABEL,
  type SignInSummary,
  type SignInGroup,
  type SignInPopulation,
} from "@/lib/sign-in-metering";
import { fmtDate } from "@/lib/display-dates";
import type { AccountScope } from "@/lib/report-scope";
import { SignInProfileDrawer, type SignInDrill } from "./sign-in-profile-drawer";
import { ReportDefinition } from "./report-definition";

export function SignInCards({
  group: g,
  summary: d,
  from,
  to,
  onDrill,
}: {
  group: SignInGroup;
  summary: SignInSummary;
  from: string;
  to: string;
  onDrill: (drill: SignInDrill) => void;
}) {
  const coverage = signInCoverage(from, to, d, g),
    prior = signInCoverage(d.prior.from, d.prior.to, d, g);
  const contacts = g.type === "trusted_contact",
    count = (n: number) => n.toLocaleString("en-ZA");
  const percentage = g.current.total
    ? Math.round((g.current.active / g.current.total) * 1000) / 10
    : 0;
  const values: {
    label: string;
    current: number;
    prior: number;
    display?: string;
    sub?: string;
    population: SignInPopulation;
    known: boolean;
  }[] = [
    {
      label: contacts ? "Active recipients" : "Active users",
      current: g.current.active,
      prior: g.prior.active,
      sub: `${count(g.current.active)} of ${count(g.current.total)} ${contacts ? "recipients given access" : "registered users"} · ${percentage}%`,
      population: "active",
      known: coverage.available,
    },
    {
      label: contacts ? "Returning recipients" : "Returning users",
      current: g.current.returning,
      prior: g.prior.returning,
      sub: `${count(g.current.returning)} of ${count(g.current.total)} · ${g.current.total ? Math.round((g.current.returning / g.current.total) * 100) : 0}% · 2+ South African days`,
      population: "returning",
      known: coverage.available,
    },
    {
      label: contacts ? "Total visits" : "Total sign-ins",
      current: g.current.sign_ins,
      prior: g.prior.sign_ins,
      sub: contacts ? "Successful access-code entries" : "Completed login records",
      population: "active",
      known: coverage.available,
    },
    {
      label: "Average days active",
      current: g.current.average_days,
      prior: g.prior.average_days,
      sub: "Per active person",
      population: "active",
      known: coverage.available,
    },
    {
      label: contacts ? "Dormant recipients" : "Dormant users",
      current: g.current.dormant,
      prior: g.prior.dormant,
      sub: `${count(g.current.dormant)} of ${count(g.current.total)} · ${g.current.total ? Math.round((g.current.dormant / g.current.total) * 100) : 0}% · 30+ days at cut-off`,
      population: "dormant",
      known: coverage.available && coverage.dormantKnown,
    },
  ];
  return (
    <section className="mb-6" aria-label={`${SIGN_IN_TYPE_LABEL[g.type]} sign-in activity`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="font-semibold text-base">{SIGN_IN_TYPE_LABEL[g.type]}</h3>
        <Button
          variant="link"
          className="!px-0 h-11 text-sm"
          onClick={() =>
            onDrill({
              type: g.type,
              population: "all",
              title: `${SIGN_IN_TYPE_LABEL[g.type]} · All people`,
            })
          }
        >
          View all people
        </Button>
      </div>
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-5 gap-3">
        {values.map((v) => {
          const delta = Math.round((v.current - v.prior) * 100) / 100,
            Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
          const compare =
            d.comparison_enabled &&
            v.known &&
            coverage.complete &&
            prior.complete &&
            prior.available &&
            (v.population !== "dormant" || prior.dormantKnown);
          return (
            <article key={v.label} className="tvp-card !p-4 flex flex-col min-w-0">
              <h4 className="tvp-kpi-label !whitespace-normal">{v.label}</h4>
              <Button
                variant="link"
                className="tvp-kpi-value !text-2xl !px-0 h-auto mt-2 self-start break-words"
                disabled={!v.known}
                onClick={() => onDrill({ type: g.type, population: v.population, title: v.label })}
              >
                {v.known
                  ? count(v.current)
                  : v.population === "dormant"
                    ? "Not tracked"
                    : "Not recorded"}
              </Button>
              {g.current.total < 5 && (
                <span className="text-xs text-muted-foreground">Small sample</span>
              )}
              <p className="tvp-muted text-xs leading-relaxed mt-1 min-h-10">
                {v.known
                  ? v.sub
                  : v.population === "dormant"
                    ? "Needs 30 days of complete observation"
                    : "Before recorded history"}
              </p>
              <p className="tvp-muted text-xs mt-2 flex items-start gap-1">
                {compare ? (
                  <>
                    <Icon className="size-3 shrink-0 mt-0.5" />
                    {delta > 0 ? "Increase " : delta < 0 ? "Decrease " : "No change "}
                    {count(Math.abs(delta))} vs prior period
                  </>
                ) : d.comparison_enabled ? (
                  "Prior comparison unavailable"
                ) : (
                  "No comparison"
                )}
              </p>
              <Button
                variant="link"
                className="!px-0 self-start h-11 mt-auto text-xs"
                disabled={!v.known}
                onClick={() =>
                  onDrill({
                    type: g.type,
                    population: v.population,
                    title: `${SIGN_IN_TYPE_LABEL[g.type]} · ${v.label}`,
                  })
                }
              >
                View raw data
              </Button>
            </article>
          );
        })}
      </div>
      <p className="tvp-muted text-xs mt-2 leading-relaxed">
        {g.tracking_since
          ? `First recorded ${contacts ? "visit" : "sign-in"}: ${fmtDate(g.tracking_since)}.`
          : `No ${contacts ? "visits" : "sign-ins"} recorded yet.`}{" "}
        {!coverage.complete &&
          "This period includes incomplete earlier history; recorded activity is not a complete usage total."}{" "}
        {contacts &&
          "Recipients are deduplicated after share scope; Real and Test totals may overlap, while All counts each recipient once."}
      </p>
    </section>
  );
}
export function SignInActivity({
  from,
  to,
  accounts,
  summary,
  isPending,
  isError,
  retry,
  onPeople,
}: {
  from: string;
  to: string;
  accounts: AccountScope;
  summary?: SignInSummary;
  isPending: boolean;
  isError: boolean;
  retry: () => void;
  onPeople?: (drill: SignInDrill) => void;
}) {
  const [drill, setDrill] = useState<SignInDrill | null>(null);
  return (
    <section className="mb-8" aria-label="Sign-in activity">
      <div className="flex items-center gap-2">
        <h2 className="tvp-h2 mb-3">Sign-in activity</h2>
        <ReportDefinition definition="sign_ins" />
      </div>
      {isPending && (
        <p className="tvp-muted" role="status">
          Calculating sign-in activity…
        </p>
      )}
      {isError && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="tvp-muted">Sign-in activity could not be calculated.</p>
          <Button variant="outline" onClick={retry}>
            <RefreshCw />
            Retry
          </Button>
        </div>
      )}
      {summary && (
        <>
          <p className="tvp-muted text-xs mb-4 leading-relaxed">
            {signInContext(summary, accounts, from, to)} Paused and suspended accounts are included;
            soft-deleted profiles and administrators are excluded. Agency labels and test flags
            reflect current records.
          </p>
          {summary.groups.map((g) => (
            <SignInCards
              key={g.type}
              group={g}
              summary={summary}
              from={from}
              to={to}
              onDrill={onPeople ?? setDrill}
            />
          ))}
          {drill && (
            <SignInProfileDrawer
              key={`${from}-${to}-${accounts}-${drill.type}-${drill.population}`}
              initial={drill}
              from={from}
              to={to}
              accounts={accounts}
              asOf={summary.as_of}
              note={signInContext(summary, accounts, from, to)}
              onClose={() => setDrill(null)}
            />
          )}
        </>
      )}
    </section>
  );
}

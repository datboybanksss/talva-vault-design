import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Target, FileText, Sparkles } from "lucide-react";

export const Route = createFileRoute("/talent/budget")({
  head: () => ({
    meta: [
      { title: "Budget & Income · TalVault Talent" },
      {
        name: "description",
        content:
          "Budget & Income is on its way — plan monthly income, track expenses and view Manager quotes and invoices in one private place.",
      },
      { property: "og:title", content: "Budget & Income · TalVault Talent" },
      {
        property: "og:description",
        content:
          "Budget & Income is on its way in the TalVault Talent portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BudgetPage,
});

const planned = [
  {
    Icon: Target,
    tone: "blue",
    title: "Monthly budget planning",
    body: "Set planned income and category budgets, then compare them against what actually happened each month.",
  },
  {
    Icon: Wallet,
    tone: "teal",
    title: "Confirmed income & expenses",
    body: "Capture money you have actually received and what you have spent, kept private to you.",
  },
  {
    Icon: FileText,
    tone: "amber",
    title: "Manager quotes & invoices",
    body: "A read-only view of quotes and invoices raised by your Manager, separate from your own budget figures.",
  },
];

function BudgetPage() {
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Budget &amp; Income</h1>
          <div className="tvp-subtitle">
            A private place to plan your money and view Manager quotes and invoices.
          </div>
        </div>
      </div>

      <div className="tvp-card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div
          className="tvp-kpi-icon tvp-bg-purple"
          style={{ width: 52, height: 52, margin: "0 auto 16px" }}
        >
          <Sparkles className="h-6 w-6" />
        </div>
        <span className="tvp-status tvp-blue">On its way</span>
        <h2 className="tvp-h2" style={{ marginTop: 14 }}>
          Budget &amp; Income is on its way
        </h2>
        <p
          className="tvp-muted"
          style={{ fontSize: 14, marginTop: 8, maxWidth: 560, marginInline: "auto" }}
        >
          A clear view of what you are earning and spending, kept right alongside your
          vault and private to you. Everything else here — your Vault, document requests
          and sharing — works as normal in the meantime.
        </p>
      </div>

      <div
        className="tvp-grid"
        style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginTop: 22 }}
      >
        {planned.map((p) => (
          <div key={p.title} className="tvp-card">
            <div className={`tvp-kpi-icon tvp-bg-${p.tone}`}>
              <p.Icon className="h-5 w-5" />
            </div>
            <h3 className="tvp-h2" style={{ fontSize: 15, marginTop: 12 }}>
              {p.title}
            </h3>
            <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

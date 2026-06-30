import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus, Info, Target, ArrowDownLeft, ArrowUpRight, Wallet, Calendar,
  ChevronLeft, ChevronRight, Pencil, FileText, CheckCircle2, Download, Lock,
} from "lucide-react";

export const Route = createFileRoute("/talent/budget")({
  head: () => ({ meta: [{ title: "Budget & Income · TalVault Talent" }] }),
  component: BudgetPage,
});

type Mode = "snapshot" | "agency";
type FinanceMode = "quotes" | "invoices";

const plan = [
  { Icon: Target, tone: "blue", label: "Planned income", value: "R 90 000", note: "Target for the month" },
  { Icon: ArrowDownLeft, tone: "green", label: "Confirmed income", value: "R 86 000", note: "Manually captured received money", valueColor: "var(--tvp-green)" },
  { Icon: ArrowUpRight, tone: "amber", label: "Actual expenses", value: "R 52 400", note: "Manual expense entries", valueColor: "#B95A10" },
  { Icon: Wallet, tone: "teal", label: "Available left", value: "R 33 600", note: "Confirmed income less expenses", valueColor: "var(--tvp-teal)" },
];

const budgetRows = [
  { name: "Training & coaching", note: "Coaching, gym, physio", planned: "R 20 000", actual: "R 18 000", variance: "+R 2 000", varTone: "good" },
  { name: "Travel & events", note: "Flights, hotels, transport", planned: "R 10 000", actual: "R 12 400", variance: "-R 2 400", varTone: "bad" },
  { name: "Living expenses", note: "Rent, utilities, groceries", planned: "R 12 000", actual: "R 9 000", variance: "+R 3 000", varTone: "good" },
  { name: "Equipment & kit", note: "Shoes, kit, equipment", planned: "R 6 000", actual: "R 8 000", variance: "-R 2 000", varTone: "warn" },
  { name: "Other", note: "Flexible monthly buffer", planned: "R 7 000", actual: "R 5 000", variance: "+R 2 000", varTone: "good" },
];

const goals = [
  { name: "Off-season fund", pct: 65, value: "R 78 000 of R 120 000", tone: "green", color: "var(--tvp-green)" },
  { name: "Tax reserve", pct: 40, value: "R 20 000 of R 50 000", tone: "amber", color: "var(--tvp-amber)" },
  { name: "Emergency fund", pct: 80, value: "R 80 000 of R 100 000", tone: "teal", color: "var(--tvp-teal)" },
];

const entries = [
  { date: "04 Jun 2026", type: "Confirmed Income", typeTone: "green", category: "Appearance fee", desc: "Received after Agency deductions", amount: "R 45 000", impact: "Counts as income" },
  { date: "08 Jun 2026", type: "Expense", typeTone: "amber", category: "Travel & events", desc: "Flights and accommodation", amount: "R 12 400", impact: "Counts as expense" },
  { date: "14 Jun 2026", type: "Budget Item", typeTone: "blue", category: "Training & coaching", desc: "Monthly coaching allocation", amount: "R 20 000", impact: "Planning only" },
];

const quotes = [
  { id: "Q-2026-001", client: "BrightBrand SA", desc: "Brand campaign", status: "Sent", tone: "blue", amount: "R 185 000", accepted: "No" },
  { id: "Q-2026-002", client: "EventWorks", desc: "Appearance fee", status: "Accepted", tone: "green", amount: "R 110 000", accepted: "Yes" },
  { id: "Q-2026-003", client: "MotionLab", desc: "Sponsorship activation", status: "Expired", tone: "amber", amount: "R 75 000", accepted: "No" },
];

const invoices = [
  { id: "INV-2026-041", desc: "Management commission — May 2026", amount: "R 18 400", status: "Paid", tone: "green" },
  { id: "INV-2026-038", desc: "Event appearance fee share", amount: "R 42 000", status: "Sent", tone: "teal" },
  { id: "INV-2026-035", desc: "Travel reimbursement — Doha", amount: "R 9 750", status: "Partially Paid", tone: "amber" },
];

function BudgetPage() {
  const [mode, setMode] = useState<Mode>("snapshot");
  const [finance, setFinance] = useState<FinanceMode>("quotes");

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Budget & Income</h1>
          <div className="tvp-subtitle">
            A private, manual picture of your monthly money and a read-only view of Agency quotes and invoices.
          </div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary"><Plus className="h-4 w-4" /> Add Entry</button>
        </div>
      </div>

      <div className="tvp-tabs">
        <button className={`tvp-tab${mode === "snapshot" ? " tvp-active" : ""}`} onClick={() => setMode("snapshot")}>Monthly Snapshot</button>
        <button className={`tvp-tab${mode === "agency" ? " tvp-active" : ""}`} onClick={() => setMode("agency")}>Quotes & Invoices</button>
      </div>

      {mode === "snapshot" && (
        <>
          <div className="tvp-income-rule">
            <div className="tvp-kpi-icon tvp-bg-amber" style={{ width: 34, height: 34 }}><Info className="h-4 w-4" /></div>
            <div style={{ fontSize: 13 }}>
              <strong>Only manually confirmed income counts in your budget.</strong>{" "}
              <span className="tvp-muted">
                Quotes and invoices from your Agency are shown separately. They do not automatically become income because commission, deductions, expenses or reconciliations may still apply before you receive your portion.
              </span>
            </div>
          </div>

          <div className="tvp-budget-hero">
            <div className="tvp-month-picker"><ChevronLeft className="h-4 w-4" /><Calendar className="h-4 w-4" /> June 2026 <ChevronRight className="h-4 w-4" /></div>
            <div className="tvp-row-actions">
              <button className="tvp-secondary">Set up monthly budget</button>
              <button className="tvp-primary"><Plus className="h-4 w-4" /> Add actual entry</button>
            </div>
          </div>

          <div className="tvp-plan-grid">
            {plan.map((p) => (
              <div key={p.label} className="tvp-card tvp-plan-card">
                <div className={`tvp-kpi-icon tvp-bg-${p.tone}`}><p.Icon className="h-5 w-5" /></div>
                <div className="tvp-plan-value" style={{ color: p.valueColor }}>{p.value}</div>
                <div className="tvp-plan-label">{p.label}</div>
                <div className="tvp-small">{p.note}</div>
              </div>
            ))}
          </div>

          <div className="tvp-budget-builder">
            <div className="tvp-card tvp-panel">
              <div className="tvp-panel-head">
                <div>
                  <h2 className="tvp-h2">Monthly Budget Plan</h2>
                  <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>Plan categories first, then compare actual entries against the plan.</p>
                </div>
                <button className="tvp-link">Edit plan</button>
              </div>
              <div className="tvp-budget-row" style={{ fontSize: 11, color: "var(--tvp-muted)", fontWeight: 900, textTransform: "uppercase", letterSpacing: 1 }}>
                <div>Category</div><div>Planned</div><div>Actual</div><div>Variance</div>
              </div>
              {budgetRows.map((r) => (
                <div key={r.name} className="tvp-budget-row">
                  <div>
                    <strong>{r.name}</strong>
                    <div className="tvp-small">{r.note}</div>
                  </div>
                  <input defaultValue={r.planned} />
                  <input defaultValue={r.actual} />
                  <span className={`tvp-variance tvp-${r.varTone}`}>{r.variance}</span>
                </div>
              ))}
            </div>

            <div className="tvp-stack">
              <div className="tvp-card tvp-panel">
                <div className="tvp-panel-head">
                  <h2 className="tvp-h2">Monthly Goals</h2>
                  <button className="tvp-link">Add goal</button>
                </div>
                {goals.map((g) => (
                  <div key={g.name} className="tvp-goal-card">
                    <div className="tvp-goal-head">
                      <strong>{g.name}</strong>
                      <span className={`tvp-status tvp-${g.tone}`}>{g.pct}%</span>
                    </div>
                    <div className="tvp-progress-pill"><span style={{ width: `${g.pct}%`, background: g.color }} /></div>
                    <p className="tvp-small" style={{ marginTop: 6 }}>{g.value}</p>
                  </div>
                ))}
              </div>

              <div className="tvp-card tvp-panel">
                <h2 className="tvp-h2">Agency money is separate</h2>
                <p className="tvp-muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Agency invoices are shown under Quotes & Invoices as read-only records. Add income here only when you have received and confirmed your actual portion.
                </p>
                <button className="tvp-secondary" style={{ marginTop: 12 }} onClick={() => setMode("agency")}>View Agency records</button>
              </div>
            </div>
          </div>

          <div className="tvp-card">
            <div className="tvp-toolbar">
              <input className="tvp-search" placeholder="Search actual entries..." />
              <div className="tvp-row-actions">
                <select className="tvp-select"><option>Type: All</option><option>Confirmed Income</option><option>Expense</option><option>Budget Item</option></select>
                <select className="tvp-select"><option>Category: All</option><option>Training & coaching</option><option>Travel & events</option><option>Living expenses</option><option>Equipment & kit</option><option>Other</option></select>
              </div>
            </div>
            <div className="tvp-table-wrap">
              <table className="tvp-table">
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th><th>Budget impact</th><th></th></tr></thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td>{e.date}</td>
                      <td><span className={`tvp-status tvp-${e.typeTone}`}>{e.type}</span></td>
                      <td>{e.category}</td>
                      <td>{e.desc}</td>
                      <td><strong>{e.amount}</strong></td>
                      <td className="tvp-muted">{e.impact}</td>
                      <td><button className="tvp-mini-btn"><Pencil className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {mode === "agency" && (
        <>
          <div className="tvp-income-rule">
            <div className="tvp-kpi-icon tvp-bg-amber" style={{ width: 34, height: 34 }}><Info className="h-4 w-4" /></div>
            <div style={{ fontSize: 13 }}>
              <strong>Read-only Agency records — not budget income.</strong>{" "}
              <span className="tvp-muted">
                Quotes, invoices and payment statuses are pulled from your Agency. These are reference records only and do not automatically update your budget income. Add income manually only once your actual portion is received and confirmed.
              </span>
            </div>
          </div>

          <div className="tvp-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 22 }}>
            <div className="tvp-card tvp-kpi">
              <div className="tvp-kpi-icon tvp-bg-blue"><FileText className="h-5 w-5" /></div>
              <div>
                <div className="tvp-kpi-value">R 749 400</div>
                <div className="tvp-kpi-label">Quoted</div>
                <div className="tvp-kpi-sub tvp-info">6 quotes · R 185 000 accepted</div>
              </div>
            </div>
            <div className="tvp-card tvp-kpi">
              <div className="tvp-kpi-icon tvp-bg-teal"><FileText className="h-5 w-5" /></div>
              <div>
                <div className="tvp-kpi-value">R 582 500</div>
                <div className="tvp-kpi-label">Invoiced</div>
                <div className="tvp-kpi-sub">6 invoices issued</div>
              </div>
            </div>
            <div className="tvp-card tvp-kpi">
              <div className="tvp-kpi-icon tvp-bg-green"><CheckCircle2 className="h-5 w-5" /></div>
              <div>
                <div className="tvp-kpi-value">R 274 500</div>
                <div className="tvp-kpi-label">Paid</div>
                <div className="tvp-kpi-sub">Recorded by Agency</div>
              </div>
            </div>
          </div>

          <div className="tvp-subtabs">
            <button className={`tvp-subtab${finance === "quotes" ? " tvp-active" : ""}`} onClick={() => setFinance("quotes")}>Quotes</button>
            <button className={`tvp-subtab${finance === "invoices" ? " tvp-active" : ""}`} onClick={() => setFinance("invoices")}>Invoices</button>
          </div>

          {finance === "quotes" && (
            <div className="tvp-card">
              <div className="tvp-toolbar">
                <input className="tvp-search" placeholder="Search quotes..." />
                <select className="tvp-select"><option>Status: All</option><option>Sent</option><option>Accepted</option><option>Expired</option><option>Declined</option></select>
              </div>
              <div className="tvp-table-wrap">
                <table className="tvp-table">
                  <thead><tr><th>Quote</th><th>Client</th><th>Description</th><th>Status</th><th>Amount</th><th>Accepted?</th></tr></thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id}>
                        <td><strong>{q.id}</strong></td>
                        <td>{q.client}</td>
                        <td>{q.desc}</td>
                        <td><span className={`tvp-status tvp-${q.tone}`}>{q.status}</span></td>
                        <td><strong>{q.amount}</strong></td>
                        <td>{q.accepted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {finance === "invoices" && (
            <div className="tvp-two-col">
              <div className="tvp-card">
                <div className="tvp-toolbar">
                  <input className="tvp-search" placeholder="Search invoices..." />
                  <select className="tvp-select"><option>Status: All</option><option>Sent</option><option>Paid</option><option>Partially Paid</option><option>Late</option></select>
                </div>
                <div className="tvp-table-wrap">
                  <table className="tvp-table">
                    <thead><tr><th>Invoice</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {invoices.map((iv) => (
                        <tr key={iv.id}>
                          <td><strong>{iv.id}</strong></td>
                          <td>{iv.desc}</td>
                          <td>{iv.amount}</td>
                          <td><span className={`tvp-status tvp-${iv.tone}`}>{iv.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="tvp-card tvp-panel">
                <div className="tvp-panel-head">
                  <div>
                    <span className="tvp-status tvp-teal">Sent</span>
                    <h2 className="tvp-h2" style={{ marginTop: 10 }}>INV-2026-038</h2>
                  </div>
                </div>
                <table className="tvp-table">
                  <tbody>
                    <tr><td className="tvp-muted">From</td><td><strong>StarBurst Talent Agency</strong></td></tr>
                    <tr><td className="tvp-muted">To</td><td><strong>Caster Semenya</strong></td></tr>
                    <tr><td className="tvp-muted">Issued</td><td><strong>20 May 2026</strong></td></tr>
                    <tr><td className="tvp-muted">Description</td><td><strong>Event appearance fee share</strong></td></tr>
                  </tbody>
                </table>
                <div className="tvp-sub-card" style={{ marginTop: 16 }}>
                  <div className="tvp-panel-head" style={{ marginBottom: 8 }}>
                    <span className="tvp-muted">Invoiced gross</span><strong>R 42 000</strong>
                  </div>
                  <div className="tvp-panel-head" style={{ marginBottom: 0 }}>
                    <span className="tvp-muted">Payment status</span><strong>Sent</strong>
                  </div>
                </div>
                <div className="tvp-footer-actions">
                  <button className="tvp-secondary"><Download className="h-4 w-4" /> Download PDF</button>
                  <button className="tvp-secondary" disabled><Lock className="h-4 w-4" /> Editing disabled</button>
                </div>
                <p className="tvp-small" style={{ textAlign: "center", marginTop: 8 }}>
                  Payment status is managed by your Agency.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

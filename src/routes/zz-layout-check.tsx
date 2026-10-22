import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FilterBar } from "@/components/shared/filter-bar";
import { EntityCard } from "@/components/shared/entity-card";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";

// TEMPORARY layout check page — deleted after screenshots.
export const Route = createFileRoute("/zz-layout-check")({ component: Page });
function Page() {
  const [q, setQ] = useState("");
  const cards = [
    ["Lindokuhle Mokoena", "Athlete", "Lara"],
    ["Wizard Test Talent", "Musician and performer", "Unassigned"],
    ["Avatar Test Talent", "Athlete", "Israel Noko"],
  ];
  return (
    <div className="tv-app" style={{ display: "block" }}>
      <main className="tvp-main" style={{ padding: 32 }}>
        <div className="tvp-card">
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: "Search by name, type or lead" }}
            active={!!q}
            onClear={() => setQ("")}
            onChange={() => {}}
            filters={[
              { key: "lead", label: "Lead", value: "all", options: [{ value: "all", label: "All leads" }] },
              { key: "type", label: "Talent type", value: "all", options: [{ value: "all", label: "All types" }] },
            ]}
          />
          <div className="tvp-entity-grid">
            {cards.map(([n, t, m]) => (
              <EntityCard
                key={n}
                name={n}
                avatarSeed={n}
                subtitle={[t, `Manager: ${m}`]}
                pills={
                  <>
                    <span className="tvp-status st-accepted">Active</span>
                    <span className="tvp-entity-since">Since 27 Jul 2026</span>
                  </>
                }
                stats={[
                  { label: "Documents", value: 12 },
                  { label: "Awaiting", value: 2, tone: "amber" },
                  { label: "Expiring", value: 0 },
                ]}
                actions={<RowActionsMenu actions={[{ key: "v", label: "View", onSelect: () => {} }]} />}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";

// TEMPORARY layout check page — deleted after screenshots.
export const Route = createFileRoute("/zz-layout-check")({ component: Page });
const CATS: [string, number, string[]][] = [
  ["Identity & Personal", 0, ["ID document", "Passport", "Proof of address", "Birth certificate", "Photos"]],
  ["Contracts & Agreements", 1, ["Management", "Endorsements"]],
  ["Banking", 3, ["Statements"]],
  ["Tax & Financial", 0, []],
  ["Travel & Visas", 2, ["Visas", "Itineraries"]],
];
function Page() {
  const [open, setOpen] = useState<string | null>("Contracts & Agreements");
  return (
    <div className="tv-app" style={{ display: "block" }}>
      <main style={{ padding: 32 }}>
        <div className="tvp-card tvp-panel">
          <h2 className="tvp-h2">Lara's folders</h2>
          <p className="tvp-muted tvp-section-desc">Open a folder to see its documents and subfolders.</p>
          <div className="tvp-folder-tree">
            {CATS.map(([name, n, subs]) => {
              const o = open === name;
              return (
                <div key={name} className={`tvp-folder-card${o ? " tvp-open" : ""}`}>
                  <button type="button" className="tvp-folder-head" onClick={() => setOpen(o ? null : name)}>
                    <span className="tvp-callout-icon tvp-bg-teal"><FolderOpen className="h-4 w-4" /></span>
                    <span style={{ minWidth: 0 }}>
                      <span className="tvp-folder-name">{name}</span>
                      <span className="tvp-folder-meta" style={{ display: "block" }}>
                        {n} {n === 1 ? "document" : "documents"}
                        {subs.length > 0 && ` · ${subs.length} ${subs.length === 1 ? "subfolder" : "subfolders"}`}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 tvp-folder-chevron" />
                  </button>
                  <div className="tvp-folder-body"><div><div className="tvp-folder-body-inner">
                    <button type="button" className="tvp-secondary" style={{ justifyContent: "flex-start" }}>
                      <FolderOpen className="h-4 w-4" /> Open all in this category
                    </button>
                    <div className="tvp-subfolder-list">
                      {subs.map((s) => <button key={s} type="button" className="tvp-subfolder-pill">{s}<span className="tvp-muted" style={{ fontSize: 11, marginLeft: 4 }}>0</span></button>)}
                    </div>
                  </div></div></div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

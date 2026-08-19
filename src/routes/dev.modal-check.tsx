import { createFileRoute } from "@tanstack/react-router";
import { Lock, X } from "lucide-react";
import { ModalShell } from "@/components/shared/modal-shell";

export const Route = createFileRoute("/dev/modal-check")({
  component: ModalCheck,
});

function Body({ label }: { label: string }) {
  return (
    <>
      <div className="tvp-modal-head">
        <h2 className="tvp-h2"><Lock className="h-4 w-4" /> Access code — {label}</h2>
        <button className="tvp-mini-btn" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="tvp-modal-body">Repro body</div>
      <div className="tvp-modal-foot"><button className="tvp-primary">Done</button></div>
    </>
  );
}

function ModalCheck() {
  return (
    <div className="tv-app">
      <aside className="tvp-sidebar" />
      <main className="tvp-main">
        {/* Ancestor that creates a containing block for fixed children AND clips overflow */}
        <div id="trap" style={{ transform: "translateZ(0)", overflow: "hidden" }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="tvp-card" style={{ padding: 16, marginBottom: 12 }}>
              Filler row {i + 1}
            </div>
          ))}
          <div className="tvp-modal-backdrop" id="inline-modal">
            <div className="tvp-modal" style={{ maxWidth: 480 }}><Body label="inline (old)" /></div>
          </div>
          <ModalShell onClose={() => {}} maxWidth={480}>
            <Body label="portal (new)" />
          </ModalShell>
        </div>
      </main>
    </div>
  );
}

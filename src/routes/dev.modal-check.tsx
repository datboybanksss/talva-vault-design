import { createFileRoute } from "@tanstack/react-router";
import { Lock, X } from "lucide-react";

export const Route = createFileRoute("/dev/modal-check")({
  component: ModalCheck,
});

function ModalCheck() {
  return (
    <div className="tv-app">
      <aside className="tvp-sidebar" />
      <main className="tvp-main">
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="tvp-card" style={{ padding: 16, marginBottom: 12 }}>
            Filler row {i + 1}
          </div>
        ))}
        <div className="tvp-modal-backdrop">
          <div className="tvp-modal" style={{ maxWidth: 480 }}>
            <div className="tvp-modal-head">
              <h2 className="tvp-h2"><Lock className="h-4 w-4" /> Access code</h2>
              <button className="tvp-mini-btn" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="tvp-modal-body">Repro body</div>
            <div className="tvp-modal-foot"><button className="tvp-primary">Done</button></div>
          </div>
        </div>
      </main>
    </div>
  );
}

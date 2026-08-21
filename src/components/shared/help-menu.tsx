/**
 * Persistent "Getting started" help control in the portal topbar.
 * Lists the real tour steps for the current portal (single source of truth:
 * the TOURS map in onboarding-tour.tsx) and can re-launch the walkthrough.
 */
import { useEffect, useRef, useState } from "react";
import { CircleHelp, Compass } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REPLAY_TOUR_EVENT, getTourSteps, type Portal } from "@/components/shared/onboarding-tour";

const PORTAL_LABEL: Record<Portal, string> = {
  admin: "the admin portal",
  agency: "the agency portal",
  talent: "your vault",
};

export function HelpMenu({ portal }: { portal: Portal }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const steps = getTourSteps(portal);
  const [selected, setSelected] = useState<string[]>(() => steps.map((s) => s.key));

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const allSelected = selected.length === steps.length;

  const toggle = (key: string) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  async function startWalkthrough() {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("You need to be signed in.");
      const { error } = await supabase
        .from("profiles")
        .update({ has_seen_onboarding: false } as any)
        .eq("id", uid);
      if (error) throw error;
      const keys = steps.filter((s) => selected.includes(s.key)).map((s) => s.key);
      setOpen(false);
      window.dispatchEvent(new CustomEvent(REPLAY_TOUR_EVENT, { detail: { keys } }));
      toast.success("Here we go — the walkthrough is starting.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start the walkthrough.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tvp-notification-wrap" ref={wrapRef}>
      <button
        type="button"
        className="tvp-icon-btn"
        aria-label="Getting started"
        title="Getting started"
        data-testid="help-menu-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      {open && (
        <div className="tvp-notification-panel" data-testid="help-menu-panel">
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <div className="tvp-h2">Getting started</div>
            <button
              type="button"
              className="tvp-link"
              onClick={() => setSelected(allSelected ? [] : steps.map((s) => s.key))}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <p className="tvp-muted" style={{ fontSize: 13 }}>
            See how to use {PORTAL_LABEL[portal]}. Pick the topics you'd like the walkthrough to
            cover:
          </p>
          <div style={{ margin: "8px 0 12px" }}>
            {steps.map((s) => (
              <label
                key={s.key}
                className="flex items-center gap-2"
                style={{ fontSize: 13, padding: "3px 0", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.key)}
                  onChange={() => toggle(s.key)}
                  data-testid={`help-topic-${s.key}`}
                />
                <span>{s.title}</span>
              </label>
            ))}
          </div>
          <button
            className="tvp-secondary"
            onClick={startWalkthrough}
            disabled={busy || selected.length === 0}
            data-testid="replay-tour"
          >
            <Compass className="h-4 w-4" /> {busy ? "Starting…" : "Start walkthrough"}
          </button>
        </div>
      )}
    </div>
  );
}


export default HelpMenu;

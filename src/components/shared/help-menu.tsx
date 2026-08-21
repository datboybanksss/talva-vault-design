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
      setOpen(false);
      window.dispatchEvent(new CustomEvent(REPLAY_TOUR_EVENT));
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
          <div className="tvp-h2" style={{ marginBottom: 6 }}>
            Getting started
          </div>
          <p className="tvp-muted" style={{ fontSize: 13 }}>
            See how to use {PORTAL_LABEL[portal]}. A short walkthrough covering:
          </p>
          <ul className="tvp-muted" style={{ fontSize: 13, margin: "8px 0 12px 18px", listStyle: "disc" }}>
            {steps.map((s) => (
              <li key={s.title} style={{ marginTop: 2 }}>
                {s.title}
              </li>
            ))}
          </ul>
          <button className="tvp-secondary" onClick={startWalkthrough} disabled={busy} data-testid="replay-tour">
            <Compass className="h-4 w-4" /> {busy ? "Starting…" : "Start walkthrough"}
          </button>
        </div>
      )}
    </div>
  );
}

export default HelpMenu;

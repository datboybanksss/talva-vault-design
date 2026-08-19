import { useState } from "react";
import { Compass } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REPLAY_TOUR_EVENT } from "@/components/shared/onboarding-tour";

/**
 * Lets a user re-run the welcome tour for the portal they are currently in.
 * Resets profiles.has_seen_onboarding and immediately re-opens the tour,
 * whether it was originally completed or skipped.
 */
export function ReplayTourButton({ label = "Replay welcome tour" }: { label?: string }) {
  const [busy, setBusy] = useState(false);

  async function replay() {
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
      window.dispatchEvent(new CustomEvent(REPLAY_TOUR_EVENT));
      toast.success("Here we go — the welcome tour is starting again.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not restart the tour.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="tvp-secondary" onClick={replay} disabled={busy} data-testid="replay-tour">
      <Compass className="h-4 w-4" /> {busy ? "Starting…" : label}
    </button>
  );
}

export function ReplayTourCard() {
  return (
    <div className="tvp-card tvp-panel">
      <div className="tvp-panel-head">
        <div>
          <h2 className="tvp-h2">Getting started</h2>
          <p className="tvp-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Take the short guided walkthrough again any time — it points out the main areas of
            this portal.
          </p>
        </div>
        <ReplayTourButton />
      </div>
    </div>
  );
}

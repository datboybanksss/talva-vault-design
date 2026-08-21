import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TourStep = {
  /** CSS selector for the element to spotlight. Falls back to a centred card. */
  selector: string;
  title: string;
  body: string;
};

export type Portal = "admin" | "agency" | "talent";

const TOURS: Record<Portal, TourStep[]> = {
  talent: [
    {
      selector: '[data-tour="/talent/vault"]',
      title: "Your Vault",
      body: "Everything you upload lives here — your Private Vault (only you can see it) and the Agency Shared Folder your Manager can access.",
    },
    {
      selector: '[data-tour="/talent/sharing"]',
      title: "Shared Access",
      body: "Give a loved one time-limited access to specific documents. They get a secure link; you give them the access code separately.",
    },
    {
      selector: '[data-tour="needs-attention"]',
      title: "Needs attention",
      body: "Your dashboard surfaces expiring documents and requests from your Manager here. Dismiss anything you've handled.",
    },
    {
      selector: '[data-tour="/talent/settings"]',
      title: "Settings",
      body: "Manage which folder categories are active, notification reminders, your password and two-factor authentication.",
    },
  ],
  agency: [
    {
      selector: '[data-tour="/agency/talent"]',
      title: "Talent Roster",
      body: "Every talent you manage, their status and their compliance at a glance.",
    },
    {
      selector: '[data-tour="/agency/document-vault"]',
      title: "Document Vault",
      body: "Upload, review and request documents. The Requests tab tracks anything you're waiting on from talent.",
    },
    {
      selector: '[data-tour="/agency/invitations"]',
      title: "Invitations",
      body: "Invite new talent and choose the shared folders they'll get the moment they accept.",
    },
    {
      selector: '[data-tour="/agency/settings"]',
      title: "Document Rules",
      body: "Under Settings you'll find Document Rules, folder templates, your Agency Profile and billing preferences.",
    },
  ],
  admin: [
    {
      selector: '[data-tour="/admin/agencies"]',
      title: "Agencies",
      body: "Every agency on the platform — activate, suspend and inspect their setup from here.",
    },
    {
      selector: '[data-tour="/admin/invitations"]',
      title: "Agency Invitations",
      body: "Create and track agency invites, edit the invitation email and send or copy the secure link.",
    },
    {
      selector: '[data-tour="/admin/administrators"]',
      title: "Administrators",
      body: "Manage who has platform admin access and their two-factor enrolment.",
    },
    {
      selector: '[data-tour="/admin/audit"]',
      title: "Audit & Support Log",
      body: "A full, filterable record of every privileged action, with IP and device details.",
    },
  ],
};

/** Read-only access to a portal's tour steps (source of truth for help copy). */
export function getTourSteps(portal: Portal): TourStep[] {
  return TOURS[portal];
}

type Rect = { top: number; left: number; width: number; height: number };

/** Fired by the "Replay welcome tour" control in Settings. */
export const REPLAY_TOUR_EVENT = "tvp:replay-tour";

export function OnboardingTour({ portal }: { portal: "admin" | "agency" | "talent" }) {
  const steps = TOURS[portal];
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Manual replay from Settings, regardless of has_seen_onboarding history.
  useEffect(() => {
    const onReplay = () => {
      setIdx(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_TOUR_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, onReplay);
  }, []);

  // Show only on a user's very first visit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("has_seen_onboarding")
        .eq("id", uid)
        .maybeSingle();
      if (!cancelled && data && (data as any).has_seen_onboarding === false) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const measure = useCallback(() => {
    if (!open) return;
    const el = document.querySelector(steps[idx]?.selector ?? "") as HTMLElement | null;
    if (!el || el.offsetParent === null) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      setRect(null);
      return;
    }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [open, idx, steps]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  const finish = useCallback(async () => {
    setOpen(false);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid) {
        await supabase
          .from("profiles")
          .update({ has_seen_onboarding: true } as any)
          .eq("id", uid);
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open || steps.length === 0) return null;

  const step = steps[idx]!;
  const last = idx === steps.length - 1;

  // Tooltip placement: beside the spotlight on desktop, pinned to the bottom of
  // the viewport when there is no visible target (mobile drawer closed, etc.).
  const pad = 8;
  const tipStyle: React.CSSProperties = rect
    ? {
        top: Math.min(
          Math.max(rect.top - 8, 12),
          Math.max(typeof window !== "undefined" ? window.innerHeight - 240 : 400, 12),
        ),
        left: Math.min(
          rect.left + rect.width + 16,
          Math.max((typeof window !== "undefined" ? window.innerWidth : 1024) - 340, 12),
        ),
      }
    : {};

  return (
    <div className="tvp-tour" role="dialog" aria-modal="true" aria-label="Getting started tour">
      {rect ? (
        <div
          className="tvp-tour-spot"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      ) : (
        <div className="tvp-tour-dim" />
      )}

      <div className={`tvp-tour-tip${rect ? "" : " tvp-tour-tip-center"}`} style={tipStyle}>
        <div className="tvp-tour-step">
          Step {idx + 1} of {steps.length}
        </div>
        <div className="tvp-tour-title">{step.title}</div>
        <p className="tvp-tour-body">{step.body}</p>
        <div className="tvp-tour-actions">
          <button className="tvp-tour-skip" onClick={finish}>
            Skip tour
          </button>
          <div className="tvp-tour-next">
            {idx > 0 && (
              <button className="tvp-secondary" onClick={() => setIdx((i) => i - 1)}>
                Back
              </button>
            )}
            <button
              className="tvp-primary"
              onClick={() => (last ? finish() : setIdx((i) => i + 1))}
            >
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TourStep = {
  /** Stable slug used for topic selection — independent of title/selector. */
  key: string;
  /** CSS selector for the element to spotlight. Falls back to a centred card. */
  selector: string;
  title: string;
  body: string;
};

export type Portal = "admin" | "agency" | "talent";

const TOURS: Record<Portal, TourStep[]> = {
  talent: [
    {
      key: "dashboard",
      selector: '[data-tour="/talent"]',
      title: "Dashboard",
      body: "Your home screen — a quick read on what's outstanding, what's expiring and what your Manager has asked for.",
    },
    {
      key: "vault",
      selector: '[data-tour="/talent/vault"]',
      title: "Your Vault",
      body: "Everything you upload lives here — your Private Vault (only you can see it) and the Agency Shared Folder your Manager can access.",
    },
    {
      key: "sharing",
      selector: '[data-tour="/talent/sharing"]',
      title: "Shared Access",
      body: "Give a loved one time-limited access to specific documents. They get a secure link; you give them the access code separately.",
    },
    {
      key: "budget",
      selector: '[data-tour="/talent/budget"]',
      title: "Budget & Income",
      body: "A place to track earnings and spending against your contracts. It's on its way — we'll let you know the moment it opens.",
    },
    {
      key: "needs-attention",
      selector: '[data-tour="needs-attention"]',
      title: "Needs attention",
      body: "Your dashboard surfaces expiring documents and requests from your Manager here. Dismiss anything you've handled.",
    },
    {
      key: "settings",
      selector: '[data-tour="/talent/settings"]',
      title: "Settings",
      body: "Manage which folder categories are active, notification reminders, your password and two-factor authentication.",
    },
  ],
  agency: [
    {
      key: "dashboard",
      selector: '[data-tour="/agency"]',
      title: "Dashboard",
      body: "Your daily overview — roster size, compliance, anything expiring soon and the latest talent activity.",
    },
    {
      key: "talent-roster",
      selector: '[data-tour="/agency/talent"]',
      title: "Talent Roster",
      body: "Every talent you manage, their status and their compliance at a glance.",
    },
    {
      key: "document-vault",
      selector: '[data-tour="/agency/document-vault"]',
      title: "Document Vault",
      body: "Upload, review and request documents. The Requests tab tracks anything you're waiting on from talent.",
    },
    {
      key: "invitations",
      selector: '[data-tour="/agency/invitations"]',
      title: "Invitations",
      body: "Invite new talent and choose the shared folders they'll get the moment they accept.",
    },
    {
      key: "quotes-invoices",
      selector: '[data-tour="/agency/quotes-invoices"]',
      title: "Quotes & Invoices",
      body: "Create quotes, convert them to invoices and track payment. The summary cards total quoted, invoiced, received and outstanding for the period you pick, and the Reports tab breaks it down with CSV or PDF export.",
    },
    {
      key: "activity-log",
      selector: '[data-tour="/agency/activity"]',
      title: "Activity Log",
      body: "A filterable record of every action on your account — who did what, when, and from which device.",
    },
    {
      key: "agency-profile",
      selector: '[data-tour="/agency/settings"]',
      title: "Agency Profile",
      body: "Your agency details, logo, tax settings and the verified address your billing emails are sent from.",
    },
    {
      key: "manage-folders",
      selector: '[data-tour="/agency/settings"]',
      title: "Manage Folders",
      body: "Under Settings, choose which folder categories and subfolders your talent get, and set templates per talent type.",
    },
    {
      key: "document-rules",
      selector: '[data-tour="/agency/settings"]',
      title: "Document Rules",
      body: "Set expiry and reminder rules per document type so renewals are chased before anything lapses.",
    },
  ],
  admin: [
    {
      key: "dashboard",
      selector: '[data-tour="/admin"]',
      title: "Dashboard",
      body: "Platform health at a glance — agencies, active talent, outstanding invites and anything needing review.",
    },
    {
      key: "agencies",
      selector: '[data-tour="/admin/agencies"]',
      title: "Agencies",
      body: "Every agency on the platform — activate, suspend and inspect their setup from here.",
    },
    {
      key: "invitations",
      selector: '[data-tour="/admin/invitations"]',
      title: "Agency Invitations",
      body: "Create and track agency invites, edit the invitation email and send or copy the secure link.",
    },
    {
      key: "quotes-invoices",
      selector: '[data-tour="/admin/quotes-invoices"]',
      title: "Quotes & Invoices",
      body: "Billing activity across the platform, so you can see what agencies have quoted, invoiced and collected.",
    },
    {
      key: "administrators",
      selector: '[data-tour="/admin/administrators"]',
      title: "Administrators",
      body: "Manage who has platform admin access and their two-factor enrolment.",
    },
    {
      key: "audit",
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

/**
 * Fired by the Help menu. Optional `detail.keys` limits the run to those step
 * keys (in the portal's normal order); with no detail the full tour runs.
 */
export const REPLAY_TOUR_EVENT = "tvp:replay-tour";

export function OnboardingTour({ portal }: { portal: "admin" | "agency" | "talent" }) {
  const allSteps = TOURS[portal];
  const [keys, setKeys] = useState<string[] | null>(null);
  const steps = keys ? allSteps.filter((s) => keys.includes(s.key)) : allSteps;
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Manual replay from the Help menu, optionally scoped to selected topics.
  useEffect(() => {
    const onReplay = (e: Event) => {
      const detail = (e as CustomEvent<{ keys?: string[] } | undefined>).detail;
      setKeys(detail?.keys?.length ? detail.keys : null);
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

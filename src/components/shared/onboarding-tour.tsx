/**
 * Guided walkthrough runtime.
 *
 * Two layers, both rendered by this component:
 *  - the portal overview tour (one step per top-level section), gated by
 *    profiles.has_seen_onboarding;
 *  - named module guides that walk a workflow inside one section, may
 *    navigate between pages and tabs, and are gated individually by
 *    profiles.seen_tours.
 *
 * Guide content lives in src/lib/tours — this file only plays it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  getGuide,
  getOverviewGuide,
  matchModuleGuides,
  type Portal,
  type TourGuide,
  type TourStep,
} from "@/lib/tours";

export type { Portal, TourStep } from "@/lib/tours";
export { getTourSteps, getOverviewGuide, getModuleGuides } from "@/lib/tours";

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Fired by the Help menu. `detail.guideId` selects the guide (defaults to the
 * portal overview); optional `detail.keys` limits the run to those step keys.
 */
export const REPLAY_TOUR_EVENT = "tvp:replay-tour";

async function markSeen(guide: TourGuide) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from("profiles")
      .select("seen_tours")
      .eq("id", uid)
      .maybeSingle();
    const seen: string[] = ((data as any)?.seen_tours as string[] | null) ?? [];
    const next = seen.includes(guide.id) ? seen : [...seen, guide.id];
    const patch: Record<string, unknown> = { seen_tours: next };
    if (guide.kind === "overview") patch.has_seen_onboarding = true;
    await supabase.from("profiles").update(patch as any).eq("id", uid);
  } catch {
    /* non-blocking */
  }
}

function waitForSelector(selector: string, timeoutMs = 1500): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el && el.offsetParent !== null) return resolve(el);
      if (Date.now() - started > timeoutMs) return resolve(null);
      window.setTimeout(tick, 60);
    };
    tick();
  });
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Smooth-scroll the target to the centre of the viewport and resolve only once
 * the scroll has actually settled (its box stops moving for a few frames), so
 * the measurement that follows is taken against a stable position.
 */
async function scrollIntoViewAndSettle(el: HTMLElement, timeoutMs = 900): Promise<void> {
  try {
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  } catch {
    el.scrollIntoView();
  }
  await new Promise<void>((resolve) => {
    const started = Date.now();
    let lastTop = Number.NaN;
    let lastLeft = Number.NaN;
    let stable = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.top - lastTop) < 0.5 && Math.abs(r.left - lastLeft) < 0.5) {
        stable += 1;
      } else {
        stable = 0;
      }
      lastTop = r.top;
      lastLeft = r.left;
      if (stable >= 4 || Date.now() - started > timeoutMs) return resolve();
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

export function OnboardingTour({ portal }: { portal: Portal }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [guide, setGuide] = useState<TourGuide | null>(null);
  const [keys, setKeys] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(true);
  const [fading, setFading] = useState(false);

  const rectRef = useRef<Rect | null>(null);
  const settlingRef = useRef(false);
  const seenRef = useRef<string[] | null>(null);
  const overviewDoneRef = useRef<boolean | null>(null);
  const autoCheckedRef = useRef<Set<string>>(new Set());

  const allSteps = guide?.steps ?? [];
  const steps: TourStep[] = keys ? allSteps.filter((s) => keys.includes(s.key)) : allSteps;
  const open = !!guide && steps.length > 0;

  /* --------------------------------------------------- manual replay ----- */
  useEffect(() => {
    const onReplay = (e: Event) => {
      const detail = (e as CustomEvent<{ guideId?: string; keys?: string[] } | undefined>).detail;
      const g = detail?.guideId ? getGuide(detail.guideId) : getOverviewGuide(portal);
      if (!g) return;
      setKeys(detail?.keys?.length ? detail.keys : null);
      setIdx(0);
      setGuide(g);
    };
    window.addEventListener(REPLAY_TOUR_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, onReplay);
  }, [portal]);

  /* --------------------------------------------------- first-visit ------- */
  // Load the user's seen state once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("has_seen_onboarding, seen_tours")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled || !data) return;
      seenRef.current = ((data as any).seen_tours as string[] | null) ?? [];
      overviewDoneRef.current = (data as any).has_seen_onboarding !== false;
      if (!overviewDoneRef.current) {
        setIdx(0);
        setKeys(null);
        setGuide(getOverviewGuide(portal));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portal]);

  // Auto-play the first unseen module guide for the section being viewed.
  useEffect(() => {
    if (guide) return;
    if (seenRef.current === null || overviewDoneRef.current !== true) return;
    const candidate = matchModuleGuides(portal, pathname).find(
      (g) => !seenRef.current!.includes(g.id) && !autoCheckedRef.current.has(g.id),
    );
    if (!candidate) return;
    autoCheckedRef.current.add(candidate.id);
    setIdx(0);
    setKeys(null);
    setGuide(candidate);
  }, [guide, pathname, portal]);

  /* --------------------------------------------------- step routing ------ */
  const step = open ? steps[idx] : undefined;

  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    const isFirst = rectRef.current === null;
    const targetRoute = step.route?.to ?? null;
    // A step is "cross-page" when it navigates somewhere different from where
    // the previous step left us (or when it is the very first step). Steps that
    // stay on the same page must not fade at all — the spotlight simply glides.
    const crossPage =
      isFirst || (targetRoute !== null && targetRoute !== currentRouteRef.current);

    setReady(false);
    settlingRef.current = true;
    if (crossPage) setFading(true);

    (async () => {
      const reduced = prefersReducedMotion();
      if (step.route) {
        if (crossPage && !isFirst && !reduced) await sleep(220); // fade-out completes
        if (cancelled) return;
        try {
          await navigate({
            to: step.route.to as any,
            search: (step.route.search ?? {}) as any,
          });
        } catch {
          /* route may not accept these search params — carry on */
        }
        if (cancelled) return;
        currentRouteRef.current = targetRoute;
        if (!reduced) await sleep(120); // let the new page paint
      }

      const el = await waitForSelector(step.selector);
      if (cancelled) return;
      if (el) {
        await scrollIntoViewAndSettle(el);
        if (cancelled) return;
      }
      settlingRef.current = false;

      if (crossPage) {
        // Still fully transparent here: snap the rect to its final position
        // (position transitions are disabled by .tvp-tour-fading), then reveal
        // on a later frame so opacity is the only thing that animates.
        setReady(true);
        measureRef.current?.(true);
        await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
        if (cancelled) return;
        await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
        if (cancelled) return;
        setFading(false);
      } else {
        // Same page: leave it visible and let the CSS position transition
        // carry the spotlight across to the new control.
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      settlingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide?.id, idx, step?.key]);


  /* --------------------------------------------------- measurement ------- */
  const measure = useCallback(() => {
    if (!open || !ready || !step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el || el.offsetParent === null) {
      rectRef.current = null;
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      rectRef.current = null;
      setRect(null);
      return;
    }
    const next = { top: r.top, left: r.left, width: r.width, height: r.height };
    const prev = rectRef.current;
    if (
      prev &&
      Math.abs(prev.top - next.top) < 0.5 &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5 &&
      Math.abs(prev.height - next.height) < 0.5
    ) {
      return; // no meaningful change — don't churn state
    }
    rectRef.current = next;
    setRect(next);
  }, [open, ready, step]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Re-measure on resize/scroll, but never while a deliberate scroll-into-view
  // is still settling, and only once per frame — the CSS transition then
  // carries the spotlight/tooltip to the new position smoothly.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const onMove = () => {
      if (settlingRef.current) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  /* --------------------------------------------------- finish ------------ */
  const finish = useCallback(async () => {
    const g = guide;
    setGuide(null);
    setKeys(null);
    setIdx(0);
    rectRef.current = null;
    setRect(null);
    setFading(false);
    if (!g) return;
    if (seenRef.current && !seenRef.current.includes(g.id)) seenRef.current.push(g.id);
    if (g.kind === "overview") overviewDoneRef.current = true;
    await markSeen(g);
  }, [guide]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open || !step) return null;

  const last = idx === steps.length - 1;

  // Tooltip placement: beside the spotlight on desktop, pinned to the centre of
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
    <div
      className={`tvp-tour${fading ? " tvp-tour-fading" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${guide!.title} walkthrough`}
    >
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
          {guide!.title} · Step {idx + 1} of {steps.length}
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

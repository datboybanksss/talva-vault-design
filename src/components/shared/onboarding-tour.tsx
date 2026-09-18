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
  getModuleGuides,
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

/**
 * Is the element actually on screen? `offsetParent` is null for anything inside
 * a `position: fixed` ancestor — the sidebar, the top bar, every modal — so it
 * cannot be used here: it made the runtime wait out the full timeout on those
 * steps and then skip both the scroll and the spotlight.
 */
/** Records that this person has declined the walkthrough entirely. */
async function markAllSeen(portal: Portal) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    const ids = [getOverviewGuide(portal).id, ...getModuleGuides(portal).map((g) => g.id)];
    const { data } = await supabase
      .from("profiles")
      .select("seen_tours")
      .eq("id", uid)
      .maybeSingle();
    const seen: string[] = ((data as any)?.seen_tours as string[] | null) ?? [];
    const next = Array.from(new Set([...seen, ...ids]));
    await supabase
      .from("profiles")
      .update({ seen_tours: next, has_seen_onboarding: true } as any)
      .eq("id", uid);
  } catch {
    /* non-blocking */
  }
}

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cs = window.getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
}

function waitForSelector(selector: string, timeoutMs = 650): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const first = document.querySelector(selector) as HTMLElement | null;
    if (first && isVisible(first)) return resolve(first); // usually already there
    const started = Date.now();
    const tick = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el && isVisible(el)) return resolve(el);
      if (Date.now() - started > timeoutMs) return resolve(null);
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Height of anything pinned to the top of the window (top bar, sticky header). */
function stickyTopInset(): number {
  let inset = 0;
  const candidates = document.querySelectorAll<HTMLElement>(
    ".tvp-topbar, [data-sticky-header], header",
  );
  candidates.forEach((el) => {
    const cs = window.getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") return;
    const r = el.getBoundingClientRect();
    if (r.top > 4 || r.height <= 0 || r.height > window.innerHeight / 2) return;
    inset = Math.max(inset, r.bottom);
  });
  return inset;
}

/**
 * Bring the target into clear view — centred where it fits, and never tucked
 * under a pinned header or off the bottom — then resolve once the scroll has
 * settled so the measurement that follows is taken against a stable position.
 * Already-visible targets return immediately: no scroll, no wait.
 */
async function scrollIntoViewAndSettle(el: HTMLElement, timeoutMs = 500): Promise<void> {
  const top = stickyTopInset() + 16;
  const bottom = window.innerHeight - 16;
  const r = el.getBoundingClientRect();
  const comfortablyVisible =
    r.top >= top && r.bottom <= bottom && r.left >= 0 && r.right <= window.innerWidth;
  if (comfortablyVisible) return;

  const reduced = prefersReducedMotion();
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const fitsInSafeArea = r.height <= bottom - top;

  try {
    if (fitsInSafeArea) {
      el.scrollIntoView({ behavior, block: "center", inline: "nearest" });
    } else {
      // Taller than the usable window: align its top just below the header.
      el.scrollIntoView({ behavior, block: "start", inline: "nearest" });
      window.scrollBy({ top: -top, behavior: "auto" });
    }
  } catch {
    el.scrollIntoView();
  }

  if (reduced) return;

  await new Promise<void>((resolve) => {
    const started = Date.now();
    let lastTop = Number.NaN;
    let lastLeft = Number.NaN;
    let stable = 0;
    const tick = () => {
      const box = el.getBoundingClientRect();
      if (Math.abs(box.top - lastTop) < 0.5 && Math.abs(box.left - lastLeft) < 0.5) {
        stable += 1;
      } else {
        stable = 0;
      }
      lastTop = box.top;
      lastLeft = box.left;
      if (stable >= 2 || Date.now() - started > timeoutMs) return resolve();
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });

  // A centred target can still end up under a pinned header when the page ran
  // out of scroll room; nudge it clear.
  const after = el.getBoundingClientRect();
  if (after.top < top) window.scrollBy({ top: after.top - top, behavior: "auto" });
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
  /** Real tooltip size, so placement can keep it (and its buttons) on screen. */
  const [tipSize, setTipSize] = useState<{ width: number; height: number }>({
    width: 340,
    height: 260,
  });
  const tipRef = useRef<HTMLDivElement | null>(null);
  /** First-login choice: start the walkthrough, or skip it for good. */
  const [welcome, setWelcome] = useState(false);

  const rectRef = useRef<Rect | null>(null);
  const settlingRef = useRef(false);
  const currentRouteRef = useRef<string | null>(null);
  const measureRef = useRef<((force?: boolean) => void) | null>(null);
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
      // Never launch straight into the walkthrough on a first login — ask first.
      if (!overviewDoneRef.current) setWelcome(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [portal]);

  // Module guides NEVER auto-play. The welcome card on a first login is the one
  // and only thing that appears unasked; once it has been answered — declined or
  // completed — every guide is opt-in through the Help menu, on every page.
  // Do not reintroduce a per-section auto-launch here.

  /* --------------------------------------------------- step routing ------ */
  const step = open ? steps[idx] : undefined;

  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    const isFirst = rectRef.current === null;
    // A destination is the page *and* the tab within it: switching tabs swaps
    // the whole panel, so it has to be treated as a move to a new area rather
    // than a spotlight glide across unchanged content.
    const targetRoute = step.route
      ? `${step.route.to}?${JSON.stringify(
          Object.entries(step.route.search ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        )}`
      : null;
    // A step is "cross-page" when it moves somewhere different from where the
    // previous step left us (or when it is the very first step). Steps that stay
    // put must not fade at all — the spotlight simply glides.
    const crossPage =
      isFirst || (targetRoute !== null && targetRoute !== currentRouteRef.current);

    setReady(false);
    settlingRef.current = true;
    if (crossPage) setFading(true);

    (async () => {
      try {
        const reduced = prefersReducedMotion();
        if (step.route) {
          if (crossPage && !isFirst && !reduced) await sleep(140); // fade-out completes
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
          if (!reduced) await sleep(60); // let the new page paint
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
          setFading(false);
        } else {
          // Same page: leave it visible and let the CSS position transition
          // carry the spotlight across to the new control.
          setReady(true);
        }
      } finally {
        // Whatever happened — a navigation that threw, a target that never
        // appeared, the user clicking Next mid-flight — the walkthrough must
        // never be left invisible-but-blocking.
        if (!cancelled) {
          settlingRef.current = false;
          setReady(true);
          setFading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      settlingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide?.id, idx, step?.key]);


  /* --------------------------------------------------- measurement ------- */
  const measure = useCallback((force = false) => {
    if (!open || !step) return;
    if (!ready && !force) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el || !isVisible(el)) {
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

  measureRef.current = measure;

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Keep the measured tooltip size in step with its content.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    setTipSize((prev) =>
      Math.abs(prev.height - r.height) < 1 && Math.abs(prev.width - r.width) < 1
        ? prev
        : { width: r.width, height: r.height },
    );
  }, [step?.key, idx, guide?.id, rect]);

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
    currentRouteRef.current = null;
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

  /* --------------------------------------------------- welcome ---------- */
  if (welcome) {
    const overview = getOverviewGuide(portal);
    const startTour = () => {
      setWelcome(false);
      setIdx(0);
      setKeys(null);
      setGuide(overview);
    };
    const declineTour = async () => {
      setWelcome(false);
      overviewDoneRef.current = true;
      const ids = [overview.id, ...getModuleGuides(portal).map((g) => g.id)];
      seenRef.current = Array.from(new Set([...(seenRef.current ?? []), ...ids]));
      // Declining means declining for good — the Help menu is the way back in.
      await markAllSeen(portal);
    };
    return (
      <div className="tvp-tour" role="dialog" aria-modal="true" aria-label="Welcome to TalVault">
        <div className="tvp-tour-dim" />
        <div className="tvp-tour-tip tvp-tour-tip-center tvp-tour-welcome">
          <div className="tvp-tour-step">Welcome to TalVault</div>
          <div className="tvp-tour-title">Would you like a quick walkthrough?</div>
          <p className="tvp-tour-body">
            It takes a couple of minutes and shows you around your workspace — where everything
            lives and what each part is for. You can stop at any point, and you can start it again
            whenever you like from the help icon in the top bar.
          </p>
          <div className="tvp-tour-actions">
            <button className="tvp-tour-skip" onClick={declineTour}>
              No thanks
            </button>
            <div className="tvp-tour-next">
              <button className="tvp-primary" onClick={startTour}>
                Show me around
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!open || !step) return null;

  const last = idx === steps.length - 1;

  // Tooltip placement: beside the spotlight on desktop, pinned to the centre of
  // the viewport when there is no visible target (mobile drawer closed, etc.).
  // Clamped against the tooltip's real measured size — a fixed height guess used
  // to push taller tooltips (and their Next button) below the fold, which left
  // the walkthrough looking frozen with no way forward.
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const tipW = tipSize.width || 340;
  const tipH = tipSize.height || 260;
  let tipStyle: React.CSSProperties = {};
  if (rect) {
    const rightOf = rect.left + rect.width + 16;
    const leftOf = rect.left - tipW - 16;
    const left =
      rightOf + tipW + 12 <= vw ? rightOf : leftOf >= 12 ? leftOf : Math.max(12, vw - tipW - 12);
    const top = Math.min(Math.max(rect.top - 8, 12), Math.max(vh - tipH - 12, 12));
    tipStyle = { top, left };
  }

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

      <div
        ref={tipRef}
        className={`tvp-tour-tip${rect ? "" : " tvp-tour-tip-center"}`}
        style={tipStyle}
      >
        <div className="tvp-tour-head">
          <div className="tvp-tour-step">
            {guide!.title} · Step {idx + 1} of {steps.length}
          </div>
          <button
            type="button"
            className="tvp-tour-close"
            onClick={finish}
            aria-label="Skip walkthrough"
            title="Skip walkthrough"
          >
            ✕
          </button>
        </div>
        <div className="tvp-tour-title">{step.title}</div>
        <p className="tvp-tour-body">{step.body}</p>
        <div className="tvp-tour-actions">
          <button className="tvp-tour-skip" onClick={finish}>
            Skip walkthrough
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

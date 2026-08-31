/**
 * Persistent "Getting started" help control in the portal topbar.
 * Lists the portal overview tour plus each module guide as its own named,
 * independently replayable entry (source of truth: src/lib/tours).
 */
import { useEffect, useRef, useState } from "react";
import { CircleHelp, Compass } from "lucide-react";
import { toast } from "sonner";
import { REPLAY_TOUR_EVENT } from "@/components/shared/onboarding-tour";
import { getModuleGuides, getOverviewGuide, type Portal, type TourGuide } from "@/lib/tours";

const PORTAL_LABEL: Record<Portal, string> = {
  admin: "the admin portal",
  agency: "the agency portal",
  talent: "your vault",
};

function GuideGroup({
  guide,
  onStart,
}: {
  guide: TourGuide;
  onStart: (guide: TourGuide, keys: string[]) => void;
}) {
  const [open, setOpen] = useState(guide.kind === "overview");
  const [selected, setSelected] = useState<string[]>(() => guide.steps.map((s) => s.key));
  const allSelected = selected.length === guide.steps.length;

  const toggle = (key: string) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  return (
    <div className="tvp-help-group" style={{ borderTop: "1px solid var(--tvp-border)", padding: "8px 0" }}>
      <button
        type="button"
        className="tvp-link"
        onClick={() => setOpen((o) => !o)}
        data-testid={`help-guide-${guide.id}`}
        style={{ display: "block", textAlign: "left", width: "100%", fontWeight: 600 }}
      >
        {guide.title}
      </button>
      <div className="tvp-muted" style={{ fontSize: 12 }}>
        {guide.description}
      </div>

      {open && (
        <>
          <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
            <span className="tvp-muted" style={{ fontSize: 12 }}>
              Topics
            </span>
            <button
              type="button"
              className="tvp-link"
              onClick={() => setSelected(allSelected ? [] : guide.steps.map((s) => s.key))}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div style={{ margin: "4px 0 8px" }}>
            {guide.steps.map((s) => (
              <label
                key={s.key}
                className="flex items-center gap-2"
                style={{ fontSize: 13, padding: "3px 0", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.key)}
                  onChange={() => toggle(s.key)}
                  data-testid={`help-topic-${guide.id}-${s.key}`}
                />
                <span>{s.title}</span>
              </label>
            ))}
          </div>
          <button
            className="tvp-secondary"
            onClick={() => onStart(guide, selected)}
            disabled={selected.length === 0}
            data-testid={`replay-tour-${guide.id}`}
          >
            <Compass className="h-4 w-4" /> Start walkthrough
          </button>
        </>
      )}
    </div>
  );
}

export function HelpMenu({ portal }: { portal: Portal }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overview = getOverviewGuide(portal);
  const modules = getModuleGuides(portal);

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

  function start(guide: TourGuide, keys: string[]) {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent(REPLAY_TOUR_EVENT, {
        detail: { guideId: guide.id, keys: keys.length === guide.steps.length ? [] : keys },
      }),
    );
    toast.success("Here we go — the walkthrough is starting.");
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
        <div
          className="tvp-notification-panel"
          data-testid="help-menu-panel"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          <div className="tvp-h2" style={{ marginBottom: 4 }}>
            Getting started
          </div>
          <p className="tvp-muted" style={{ fontSize: 13 }}>
            See how to use {PORTAL_LABEL[portal]}. Start with the overview, or replay a guide for a
            specific area:
          </p>
          <GuideGroup guide={overview} onStart={start} />
          {modules.map((g) => (
            <GuideGroup key={g.id} guide={g} onStart={start} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HelpMenu;

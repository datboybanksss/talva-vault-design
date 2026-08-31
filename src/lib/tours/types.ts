export type Portal = "admin" | "agency" | "talent";

export type TourRoute = {
  /** Path to navigate to before the step is measured. */
  to: string;
  /** Search params for that path (tab selection, etc.). */
  search?: Record<string, unknown>;
};

export type TourStep = {
  /** Stable slug used for topic selection — independent of title/selector. */
  key: string;
  /** CSS selector for the element to spotlight. Falls back to a centred card. */
  selector: string;
  title: string;
  body: string;
  /** Navigate here before spotlighting, so one guide can span pages and tabs. */
  route?: TourRoute;
  /** Target may legitimately be absent (empty tables) — never treat as an error. */
  optional?: boolean;
};

export type TourGuide = {
  /** e.g. "agency.overview" or "agency.quotes-invoices". */
  id: string;
  portal: Portal;
  kind: "overview" | "module";
  title: string;
  description: string;
  /** Path prefixes that trigger the first-visit auto-play for module guides. */
  match?: string[];
  steps: TourStep[];
};

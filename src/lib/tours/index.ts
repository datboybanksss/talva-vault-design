import { GUIDES } from "./registry";
import type { Portal, TourGuide } from "./types";

export type { Portal, TourGuide, TourStep, TourRoute } from "./types";
export { GUIDES } from "./registry";

export function getOverviewGuide(portal: Portal): TourGuide {
  return GUIDES.find((g) => g.portal === portal && g.kind === "overview")!;
}

export function getModuleGuides(portal: Portal): TourGuide[] {
  return GUIDES.filter((g) => g.portal === portal && g.kind === "module");
}

export function getGuide(id: string): TourGuide | undefined {
  return GUIDES.find((g) => g.id === id);
}

/** Module guides whose `match` prefixes cover the given pathname. */
export function matchModuleGuides(portal: Portal, pathname: string): TourGuide[] {
  return getModuleGuides(portal).filter((g) =>
    (g.match ?? []).some((p) => pathname === p || pathname.startsWith(p + "/")),
  );
}

/** Back-compat helper: the portal overview steps. */
export function getTourSteps(portal: Portal) {
  return getOverviewGuide(portal).steps;
}

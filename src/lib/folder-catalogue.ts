/**
 * Client-side access to the folder taxonomy.
 *
 * Everything — categories, subfolders, talent-type templates and per-agency
 * overrides — is stored in the database. Nothing in this file hardcodes the
 * taxonomy; it only shapes what the server returns.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { listFolderCatalogue } from "@/lib/agency.functions";

export type CatalogueCategory = {
  slug: string;
  name: string;
  sort_order: number;
  restricted: boolean;
  recommended: boolean;
  ai_filing_allowed: boolean;
  default_validity_rule: string;
  can_untick: boolean;
};

export type CatalogueSubfolder = {
  id: string;
  category_slug: string;
  name: string;
  kind: "default" | "optional";
  sort_order: number;
};

export type TemplateItem = {
  talent_type: string;
  category_slug: string;
  subfolder_name: string;
  sort_order: number;
};

export type AgencySubfolderSetting = {
  id: string;
  category_slug: string;
  name: string;
  kind: "default" | "optional";
  enabled: boolean;
  sort_order: number;
  retention_years: number | null;
};

export type FolderCatalogue = {
  agencyId: string | null;
  role: string | null;
  categories: CatalogueCategory[];
  subfolders: CatalogueSubfolder[];
  templates: TemplateItem[];
  agencySubfolders: AgencySubfolderSetting[];
};

export const folderCatalogueQO = queryOptions({
  queryKey: ["folder-catalogue"],
  queryFn: () => listFolderCatalogue() as Promise<FolderCatalogue>,
  staleTime: 5 * 60_000,
});

export type ResolvedSubfolder = {
  name: string;
  kind: "default" | "optional";
  /** Where this subfolder comes from. */
  source: "platform" | "agency" | "talent_type";
  enabled: boolean;
  sortOrder: number;
  /** Present when this agency has stored an override for the subfolder. */
  overrideId: string | null;
};

/**
 * Subfolders for one category: platform catalogue, overlaid with this agency's
 * settings, plus any additions the given talent type brings. Names are
 * de-duplicated case-insensitively — the first source above wins.
 */
export function resolveSubfolders(
  catalogue: FolderCatalogue,
  categorySlug: string,
  talentType?: string | null,
): ResolvedSubfolder[] {
  const out: ResolvedSubfolder[] = [];
  const seen = new Set<string>();
  const push = (row: ResolvedSubfolder) => {
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };

  const overrides = new Map(
    catalogue.agencySubfolders
      .filter((s) => s.category_slug === categorySlug)
      .map((s) => [s.name.trim().toLowerCase(), s]),
  );

  for (const s of catalogue.subfolders.filter((x) => x.category_slug === categorySlug)) {
    const o = overrides.get(s.name.trim().toLowerCase());
    push({
      name: s.name,
      kind: (o?.kind ?? s.kind) as "default" | "optional",
      source: "platform",
      enabled: o?.enabled ?? true,
      sortOrder: o?.sort_order ?? s.sort_order,
      overrideId: o?.id ?? null,
    });
  }

  for (const o of catalogue.agencySubfolders.filter((x) => x.category_slug === categorySlug)) {
    push({
      name: o.name,
      kind: o.kind,
      source: "agency",
      enabled: o.enabled,
      sortOrder: o.sort_order,
      overrideId: o.id,
    });
  }

  if (talentType) {
    for (const t of catalogue.templates.filter(
      (x) => x.category_slug === categorySlug && x.talent_type === talentType,
    )) {
      push({
        name: t.subfolder_name,
        kind: "default",
        source: "talent_type",
        enabled: true,
        sortOrder: 200 + t.sort_order,
        overrideId: null,
      });
    }
  }

  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Talent types that have folder templates, plus a catch-all. */
export function talentTypesFrom(catalogue: FolderCatalogue): string[] {
  const set = new Set(catalogue.templates.map((t) => t.talent_type));
  const list = Array.from(set).sort((a, b) => a.localeCompare(b));
  return [...list, "Other"];
}

export function categoryNames(catalogue: FolderCatalogue): string[] {
  return catalogue.categories.map((c) => c.name);
}

const EMPTY_CATALOGUE: FolderCatalogue = {
  agencyId: null,
  role: null,
  categories: [],
  subfolders: [],
  templates: [],
  agencySubfolders: [],
};

/** Live taxonomy for the signed-in user; empty until the query resolves. */
export function useFolderCatalogue(): FolderCatalogue {
  const q = useQuery(folderCatalogueQO);
  return q.data ?? EMPTY_CATALOGUE;
}

/** Top-level category names, in platform order. */
export function useFolderNames(): string[] {
  return categoryNames(useFolderCatalogue());
}

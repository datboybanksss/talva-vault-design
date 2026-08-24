/**
 * Client-side access to the Talent Private Vault folder taxonomy.
 *
 * Mirrors the Agency pattern in `folder-catalogue.ts`: categories, subfolders
 * and the starter selection all live in the database
 * (`talent_vault_catalogue_categories` / `talent_vault_catalogue_subfolders`),
 * which is the same source the `seed_talent_default_folders` routine reads.
 * Nothing here hardcodes the taxonomy.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { listTalentVaultCatalogue } from "@/lib/talent-vault.functions";

export type VaultCategory = {
  slug: string;
  name: string;
  icon: string;
  tone: string;
  sort_order: number;
  is_starter: boolean;
};

export type VaultSubfolder = {
  id: string;
  category_slug: string;
  /** null = directly under the category; otherwise the group it belongs to. */
  parent_name: string | null;
  name: string;
  kind: "group" | "folder";
  sort_order: number;
};

export type TalentVaultCatalogue = {
  categories: VaultCategory[];
  subfolders: VaultSubfolder[];
};

const EMPTY: TalentVaultCatalogue = { categories: [], subfolders: [] };

export const talentVaultCatalogueQO = queryOptions({
  queryKey: ["talent", "vault-catalogue"],
  queryFn: () => listTalentVaultCatalogue() as Promise<TalentVaultCatalogue>,
  staleTime: 5 * 60_000,
});

/** Live taxonomy for the signed-in talent; empty until the query resolves. */
export function useTalentVaultCatalogue() {
  const q = useQuery(talentVaultCatalogueQO);
  return { catalogue: q.data ?? EMPTY, isLoading: q.isLoading };
}

export function starterCategories(cat: TalentVaultCatalogue): VaultCategory[] {
  return cat.categories.filter((c) => c.is_starter);
}

/**
 * How many folders a category provisions: its groups, their children, its flat
 * subfolders, plus the "Other" catch-all every category gets.
 */
export function subfolderCount(cat: TalentVaultCatalogue, slug: string): number {
  return cat.subfolders.filter((s) => s.category_slug === slug).length + 1;
}

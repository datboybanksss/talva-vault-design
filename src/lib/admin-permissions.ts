/**
 * Single source of truth for administrator permission levels.
 * Labels, descriptions and the ordering used for the "you may only grant a
 * level at or below your own" rule all come from here — never hardcode them.
 */
export type AdminPermissionLevel = "view_only" | "edit";

export type AdminPermissionDef = {
  value: AdminPermissionLevel;
  /** Higher rank = more authority. Used to cap what an inviter may grant. */
  rank: number;
  label: string;
  optionLabel: string;
  description: string;
  tone: "green" | "amber";
};

export const ADMIN_PERMISSION_LEVELS: AdminPermissionDef[] = [
  {
    value: "edit",
    rank: 2,
    label: "Edit rights",
    optionLabel: "Edit rights — full access",
    description:
      "Can perform all administrator actions (suspend agencies, send invites, approve legal copy, etc.).",
    tone: "green",
  },
  {
    value: "view_only",
    rank: 1,
    label: "View only",
    optionLabel: "View only — read-only access",
    description: "Can view every admin screen but cannot perform any write action.",
    tone: "amber",
  },
];

export const HIGHEST_ADMIN_PERMISSION: AdminPermissionLevel = "edit";

export function adminPermission(level?: string | null): AdminPermissionDef | undefined {
  return ADMIN_PERMISSION_LEVELS.find((p) => p.value === level);
}

export function adminPermissionRank(level?: string | null): number {
  return adminPermission(level)?.rank ?? 0;
}

/** Levels an inviter at `inviterLevel` is authorised to grant. */
export function grantableAdminPermissions(
  inviterLevel?: string | null,
): AdminPermissionDef[] {
  const cap = adminPermissionRank(inviterLevel);
  return ADMIN_PERMISSION_LEVELS.filter((p) => p.rank <= cap);
}

/** Only administrators at the highest level may invite other administrators. */
export function canInviteAdministrators(inviterLevel?: string | null): boolean {
  return adminPermissionRank(inviterLevel) >= adminPermissionRank(HIGHEST_ADMIN_PERMISSION);
}

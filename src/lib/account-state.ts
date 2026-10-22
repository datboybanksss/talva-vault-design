/**
 * Admin Pause / Suspend rules for agency and talent accounts — one place for
 * the reasons, which actions a state allows and what each action leads to.
 * The server functions call canApplyAccountAction before writing.
 *
 * Pause overlays the account's state (no access at all); unpausing restores
 * exactly what was there, so a suspended account returns to suspended.
 * Suspend = read-only for post_end_read_only_years(), then access ends.
 */
export const ACCOUNT_UNAVAILABLE_MESSAGE =
  "Your account is temporarily unavailable. Please contact hello@talvault.com.";
/** Prefix the server uses so the browser can recognise the refusal. */
export const ACCOUNT_PAUSED_CODE = "ACCOUNT_PAUSED";
export const ACCOUNT_SUSPENDED_CODE = "ACCOUNT_SUSPENDED";
export const ACCOUNT_READ_ONLY_MESSAGE =
  "Your account is read-only, so this can't be changed. Please contact hello@talvault.com.";

export const PAUSE_REASONS = {
  legal: "Legal",
  investigation: "Investigation",
  other: "Other",
} as const;
export const SUSPEND_REASONS = {
  non_payment: "Non-payment",
  other: "Other",
} as const;
export type PauseReason = keyof typeof PAUSE_REASONS;
export type SuspendReason = keyof typeof SUSPEND_REASONS;

export type AccountStateAction = "pause" | "unpause" | "suspend" | "unsuspend";
export type AccountState = { paused: boolean; suspended: boolean };

export const ACCOUNT_ACTION_LABEL: Record<AccountStateAction, string> = {
  pause: "Pause account",
  unpause: "Unpause account",
  suspend: "Suspend account",
  unsuspend: "Unsuspend account",
};

/** Actions an admin with edit rights may take for the current state. */
export function accountStateActions(state: AccountState, canEdit: boolean): AccountStateAction[] {
  if (!canEdit) return [];
  if (state.paused) return ["unpause"];
  if (state.suspended) return ["unsuspend", "pause"];
  return ["pause", "suspend"];
}

export function canApplyAccountAction(action: AccountStateAction, state: AccountState): boolean {
  return accountStateActions(state, true).includes(action);
}

/** The state after an action. Pause never touches suspension and vice versa. */
export function applyAccountAction(action: AccountStateAction, state: AccountState): AccountState {
  if (!canApplyAccountAction(action, state)) {
    throw new Error("That action isn't available for this account's current status.");
  }
  switch (action) {
    case "pause":
      return { ...state, paused: true };
    case "unpause":
      return { ...state, paused: false };
    case "suspend":
      return { ...state, suspended: true };
    case "unsuspend":
      return { ...state, suspended: false };
  }
}

export function reasonsFor(action: "pause" | "suspend"): Record<string, string> {
  return action === "pause" ? PAUSE_REASONS : SUSPEND_REASONS;
}
export function isValidReason(action: "pause" | "suspend", reason: string): boolean {
  return Object.prototype.hasOwnProperty.call(reasonsFor(action), reason);
}

/** Plain-language effect shown in the confirmation dialog. */
export function accountActionEffect(
  action: AccountStateAction,
  type: "agency" | "talent",
  years: number,
): string {
  const who = type === "agency" ? "The agency and all of its staff" : "This talent";
  switch (action) {
    case "pause":
      return `${who} will be signed out straight away and won't be able to sign in or use TalVault. When signing in they'll see that the account is temporarily unavailable — no reason is given. Nothing is deleted or changed, and you can unpause at any time.`;
    case "unpause":
      return `${who} will be able to sign in again, with exactly the access they had before the pause.`;
    case "suspend":
      return `${who} will have read-only access for ${years} years: they can view and download, but can't add, change or delete anything. After that, access ends. You can unsuspend at any time.`;
    case "unsuspend":
      return `${who} will get full access back, exactly as before, and the read-only end date is cleared.`;
  }
}

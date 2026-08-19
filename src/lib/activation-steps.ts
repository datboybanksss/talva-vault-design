/**
 * Single source of truth for the agency activation wizard steps.
 * The stepper, the "Step X of Y" label and the wizard bounds all derive
 * from this list — never retype the step count as a literal.
 */

export type ActivationStep = {
  /** 1-based position, derived from array order. */
  num: number;
  key: "accept" | "details" | "password" | "terms";
  title: string;
};

const STEP_KEYS = [
  { key: "accept", title: "Accept Agency Invite" },
  { key: "details", title: "Confirm your details" },
  { key: "password", title: "Create your password" },
  { key: "terms", title: "Terms & Conditions" },
] as const;

export const AGENCY_ACTIVATION_STEPS: ActivationStep[] = STEP_KEYS.map((s, i) => ({
  num: i + 1,
  key: s.key,
  title: s.title,
}));

export const AGENCY_ACTIVATION_STEP_COUNT = AGENCY_ACTIVATION_STEPS.length;

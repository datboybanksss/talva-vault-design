import { ageOn, MINIMUM_TALENT_AGE } from "./terms";

export function validBirthDate(value: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today.toISOString().slice(0, 10);
}

export function adultBirthDate(value: string, today = new Date()): boolean {
  return validBirthDate(value, today) && ageOn(value, today) >= MINIMUM_TALENT_AGE;
}

export function talentOnboardingSlotAllowed(kind: string, slot: string): boolean {
  return kind !== "talent" || slot === "proof_of_talent";
}
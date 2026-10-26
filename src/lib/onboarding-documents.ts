import { quarantineReason } from "./document-quarantine";

export type OnboardingDocument = {
  id: string;
  file_name: string;
  doc_slot: string;
  quarantine_reason?: string | null;
  validated_at?: string | null;
};

const normalise = (name: string) => name.trim().toLowerCase();

export function duplicateOnboardingName(rows: OnboardingDocument[], name: string) {
  return rows.some((row) => !quarantineReason(row) && normalise(row.file_name) === normalise(name));
}

export function blockedReplacements<T extends OnboardingDocument>(
  rows: T[],
  slot: string,
  name: string,
): T[] {
  return rows.filter(
    (row) =>
      quarantineReason(row) &&
      row.doc_slot === slot &&
      normalise(row.file_name) === normalise(name),
  );
}

export function onboardingPanelDocuments<T extends OnboardingDocument>(
  draft: T[] | null,
  staged: T[],
) {
  return draft === null ? staged : [...draft, ...staged.filter((row) => quarantineReason(row))];
}

export function onboardingSession(draftId?: string): string {
  if (typeof window !== "undefined" && draftId) {
    const saved = window.sessionStorage.getItem(`onboarding-session:${draftId}`);
    if (saved) return saved;
  }
  return crypto.randomUUID();
}

export function rememberOnboardingSession(draftId: string, sessionId: string) {
  window.sessionStorage.setItem(`onboarding-session:${draftId}`, sessionId);
}

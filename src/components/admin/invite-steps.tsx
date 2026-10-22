import { fmtLongDate } from "@/lib/notice-email";

const STEPS = [
  { key: "type", label: "1. Who are you inviting?" },
  { key: "details", label: "2. Details and documents" },
  { key: "review", label: "3. Review email" },
] as const;

/** Step indicator for the Admin New invitation journey. */
export function InviteSteps({ current }: { current: "details" | "review" }) {
  return (
    <ol className="tvp-steps" aria-label="Invitation steps">
      {STEPS.map((s) => (
        <li key={s.key} aria-current={s.key === current ? "step" : undefined}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** The expiry date the invitation will carry if sent today. */
export function previewExpiry(days: number) {
  return fmtLongDate(new Date(Date.now() + days * 86400000).toISOString());
}

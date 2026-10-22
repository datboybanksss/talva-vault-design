import { Building2, UserRound } from "lucide-react";
import type { InvitationType } from "@/lib/invitation-filters";

const OPTIONS: Array<{
  value: InvitationType;
  label: string;
  hint: string;
  icon: typeof Building2;
}> = [
  {
    value: "agency",
    label: "Agency",
    hint: "A talent management agency, with its compliance documents.",
    icon: Building2,
  },
  {
    value: "talent",
    label: "Talent",
    hint: "Independent talent joining without an agency, with ID and proof of talent.",
    icon: UserRound,
  },
];

/**
 * First field of the New invitation form. Required and never pre-selected;
 * once a draft exists the type is shown read-only (delete the draft to change it).
 */
export function InvitationTypeField({
  value,
  onChange,
  locked = false,
}: {
  value: InvitationType | null;
  onChange?: (v: InvitationType) => void;
  locked?: boolean;
}) {
  if (locked && value) {
    const opt = OPTIONS.find((o) => o.value === value)!;
    return (
      <div className="tvp-form-group tvp-invite-type" data-tour="admin-invite-type-field">
        <span className="tvp-invite-type-legend">Who are you inviting?</span>
        <div className="tvp-invite-type-locked">
          <span className="tvp-status st-neutral">{opt.label}</span>
          <span className="tvp-small">
            The type can't be changed once a draft is saved. To change it, delete this draft and
            start again.
          </span>
        </div>
      </div>
    );
  }
  return (
    <fieldset className="tvp-invite-type" data-tour="admin-invite-type-field">
      <legend className="tvp-invite-type-legend">
        Who are you inviting? <span aria-hidden="true">*</span>
      </legend>
      <div className="tvp-invite-type-options" role="radiogroup" aria-required="true">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const checked = value === o.value;
          return (
            <label key={o.value} className={`tvp-invite-type-card${checked ? " is-checked" : ""}`}>
              <input
                type="radio"
                name="invitation-type"
                value={o.value}
                checked={checked}
                onChange={() => onChange?.(o.value)}
              />
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>
                <strong>{o.label}</strong>
                <span className="tvp-small">{o.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

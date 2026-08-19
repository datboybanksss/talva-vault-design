import { CalendarRange } from "lucide-react";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/billing-reports";

export type PeriodState = {
  key: PeriodKey;
  custom: { from: string; to: string };
};

export function BillingPeriodSelector({
  value,
  onChange,
  label,
}: {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
  label?: string;
}) {
  return (
    <div className="tvp-period-bar">
      <span className="tvp-period-icon"><CalendarRange className="h-4 w-4" /></span>
      <label className="tvp-period-label" htmlFor="tvp-period-select">Period</label>
      <select
        id="tvp-period-select"
        className="tvp-select"
        value={value.key}
        onChange={(e) => onChange({ ...value, key: e.target.value as PeriodKey })}
      >
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>

      {value.key === "custom" && (
        <>
          <input
            type="date"
            className="tvp-input"
            aria-label="Date from"
            value={value.custom.from}
            max={value.custom.to || undefined}
            onChange={(e) => onChange({ ...value, custom: { ...value.custom, from: e.target.value } })}
          />
          <span className="tvp-period-label">to</span>
          <input
            type="date"
            className="tvp-input"
            aria-label="Date to"
            value={value.custom.to}
            min={value.custom.from || undefined}
            onChange={(e) => onChange({ ...value, custom: { ...value.custom, to: e.target.value } })}
          />
        </>
      )}

      {label && <span className="tvp-period-current">Showing: {label}</span>}
    </div>
  );
}

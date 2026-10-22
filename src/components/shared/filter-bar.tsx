import { useId } from "react";

export type FilterOption = { value: string; label: string; count?: number };
export type FilterDef = {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
};

/**
 * Shared compact filter bar: one labelled dropdown per filter on a single
 * wrapping row, plus "Clear filters" only when something is active.
 * Used by the Admin Invitations list (overview + page) and Accounts.
 */
export function FilterBar({
  filters,
  onChange,
  onClear,
  active,
  tourId,
}: {
  filters: FilterDef[];
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  active: boolean;
  tourId?: string;
}) {
  const baseId = useId();
  return (
    <div className="tvp-filter-bar" data-tour={tourId}>
      {filters.map((f) => {
        const id = `${baseId}-${f.key}`;
        return (
          <label key={f.key} className="tvp-filter-field" htmlFor={id}>
            <span className="tvp-filter-label">{f.label}:</span>
            <select id={id} value={f.value} onChange={(e) => onChange(f.key, e.target.value)}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.count !== undefined ? ` (${o.count})` : ""}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {active && (
        <button type="button" className="tvp-link tvp-filter-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

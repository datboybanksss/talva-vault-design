import { useId } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterOption = { value: string; label: string; count?: number };
export type FilterDef = {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
};

const optionText = (o: FilterOption) => `${o.label}${o.count !== undefined ? ` (${o.count})` : ""}`;

/**
 * Shared filter bar: one labelled Select (the app's standard Select component)
 * per filter, plus "Clear filters" only when something is active.
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
          <div key={f.key} className="tvp-filter-field">
            <label className="tvp-filter-label" htmlFor={id}>
              {f.label}
            </label>
            <Select value={f.value} onValueChange={(v) => onChange(f.key, v)}>
              <SelectTrigger id={id} className="tvp-filter-control">
                <SelectValue>
                  {f.options.find((o) => o.value === f.value)?.label ?? f.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="tvp-filter-menu">
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {optionText(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

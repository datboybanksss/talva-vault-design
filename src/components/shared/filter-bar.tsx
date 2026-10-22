import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
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
export type FilterSearch = {
  value: string;
  /** Called ~300 ms after typing stops (immediately on clear). */
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
};

const optionText = (o: FilterOption) => `${o.label}${o.count !== undefined ? ` (${o.count})` : ""}`;
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Shared filter bar: optional search box first, then one labelled Select (the
 * app's standard Select component) per filter, plus "Clear filters" only when
 * something is active.
 */
export function FilterBar({
  filters,
  onChange,
  onClear,
  active,
  tourId,
  search,
}: {
  filters: FilterDef[];
  onChange: (key: string, value: string) => void;
  onClear?: () => void;
  active?: boolean;
  tourId?: string;
  search?: FilterSearch;
}) {
  const baseId = useId();
  return (
    <div className="tvp-filter-bar" data-tour={tourId}>
      {search && <SearchField id={`${baseId}-search`} {...search} />}
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
      {active && onClear && (
        <button type="button" className="tvp-link tvp-filter-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

function SearchField({
  id,
  value,
  onChange,
  label = "Search",
  placeholder = "Search by name or email",
}: FilterSearch & { id: string }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  // Follow outside changes (Clear filters, back button).
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text.trim() === last.current.trim()) return;
    const t = setTimeout(() => {
      last.current = text.trim();
      onChange(text.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, onChange]);
  const clear = () => {
    setText("");
    last.current = "";
    onChange("");
  };
  return (
    <div className="tvp-filter-field tvp-filter-search">
      <label className="tvp-filter-label" htmlFor={id}>
        {label}
      </label>
      <div className="tvp-filter-search-wrap">
        <Search className="tvp-filter-search-icon h-4 w-4" aria-hidden="true" />
        <Input
          id={id}
          type="search"
          className="tvp-filter-control tvp-filter-search-input"
          placeholder={placeholder}
          value={text}
          maxLength={100}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && text && clear()}
        />
        {text && (
          <button
            type="button"
            className="tvp-filter-search-clear"
            aria-label="Clear search"
            onClick={clear}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

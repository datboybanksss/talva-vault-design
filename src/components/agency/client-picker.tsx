import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { AgencyClient } from "@/components/agency/clients-panel";

/** Searchable list of the agency's active clients, with "Add new client" last. */
export function ClientPicker({
  id,
  clients,
  value,
  fallbackLabel,
  disabled,
  onSelect,
  onAddNew,
}: {
  id?: string;
  clients: AgencyClient[];
  value: string | null;
  fallbackLabel?: string | null;
  disabled?: boolean;
  onSelect: (client: AgencyClient) => void;
  onAddNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);
  const label = selected?.name ?? fallbackLabel ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="tvp-filter-control tvp-client-picker"
        >
          <span className={label ? undefined : "tvp-muted"}>{label ?? "Choose a client…"}</span>
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="tvp-client-picker-menu p-0" align="start">
        <Command
          filter={(v, search) => (v.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search clients…" />
          <CommandList>
            <CommandEmpty>No matching clients.</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.contact_person ?? ""} ${(c.emails ?? []).join(" ")} ${c.vat_number ?? ""} ${c.id}`}
                  onSelect={() => {
                    onSelect(c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className="h-4 w-4"
                    style={{ opacity: c.id === value ? 1 : 0 }}
                    aria-hidden
                  />
                  <span>
                    {c.name}
                    {c.contact_person ? (
                      <span className="tvp-muted"> — {c.contact_person}</span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="__add_new_client__"
                onSelect={() => {
                  setOpen(false);
                  onAddNew();
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add new client
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

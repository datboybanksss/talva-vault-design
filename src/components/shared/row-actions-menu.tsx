import { MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * One action inside the overflow ("kebab") menu.
 *
 * Menus are state-driven: build the array from the item's real status and the
 * caller's permissions, or set `hidden` — never render a fixed list of every
 * possible action.
 */
export type RowAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  /** Internal route — renders the item as a link instead of a button. */
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  /** Red styling for Delete / Revoke / Suspend and similar. */
  destructive?: boolean;
  disabled?: boolean;
  /** Convenience so callers can inline conditions without filtering. */
  hidden?: boolean;
  /** Optional hint shown on hover, e.g. why an action is disabled. */
  title?: string;
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
};

/**
 * Platform-wide overflow menu for table rows, list rows and cards.
 *
 * This is the single source of truth for the pattern: keep at most one or two
 * primary actions inline in the row and pass every secondary action here.
 * Changing the trigger or panel styling here changes it everywhere.
 */
export function RowActionsMenu({
  actions,
  label = "More actions",
  align = "end",
  className,
}: {
  actions: Array<RowAction | false | null | undefined>;
  label?: string;
  align?: "start" | "end" | "center";
  className?: string;
}) {
  const items = actions.filter(
    (a): a is RowAction => Boolean(a) && !(a as RowAction).hidden,
  );
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`tvp-kebab-btn${className ? ` ${className}` : ""}`}
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={6} className="tvp-kebab-menu">
        {items.map((a) => {
          const Icon = a.icon;
          const inner = (
            <>
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
              <span>{a.label}</span>
            </>
          );
          const itemClass = `tvp-kebab-item${a.destructive ? " tvp-kebab-danger" : ""}`;
          return (
            <div key={a.key}>
              {a.separatorBefore && <DropdownMenuSeparator className="tvp-kebab-sep" />}
              <DropdownMenuItem
                className={itemClass}
                disabled={a.disabled}
                title={a.title}
                onSelect={(e) => {
                  if (a.to) return;
                  e.preventDefault();
                  a.onSelect?.();
                }}
                asChild={Boolean(a.to && !a.disabled)}
              >
                {a.to && !a.disabled ? (
                  <Link
                    to={a.to as any}
                    params={a.params as any}
                    search={a.search as any}
                    className={itemClass}
                  >
                    {inner}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-2">{inner}</span>
                )}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

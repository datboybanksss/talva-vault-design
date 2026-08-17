import { ChevronDown, Loader2 } from "lucide-react";

type Props = {
  hasMore: boolean;
  shown: number;
  /** Total row count when known (client-side lists). Omit for server paging. */
  total?: number;
  onLoadMore: () => void;
  loading?: boolean;
  /** Plural noun used in the count line, e.g. "events", "agencies". */
  noun?: string;
};

/**
 * Shared "Load more" control for every long list on the platform.
 * Renders the count line always, and the button only while more rows exist.
 */
export function LoadMoreBar({
  hasMore,
  shown,
  total,
  onLoadMore,
  loading = false,
  noun = "rows",
}: Props) {
  if (shown === 0) return null;
  return (
    <div className="tvp-load-more">
      <div className="tvp-muted" style={{ fontSize: 12 }}>
        Showing {shown}
        {typeof total === "number" ? ` of ${total}` : ""} {noun}
      </div>
      {hasMore && (
        <button
          type="button"
          className="tvp-secondary"
          onClick={onLoadMore}
          disabled={loading}
          data-testid="load-more"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Load more
        </button>
      )}
    </div>
  );
}

/** Same control, rendered as a full-width row inside a table body. */
export function LoadMoreRow({ colSpan, ...props }: Props & { colSpan: number }) {
  if (props.shown === 0) return null;
  return (
    <tr className="tvp-load-more-row">
      <td colSpan={colSpan}>
        <LoadMoreBar {...props} />
      </td>
    </tr>
  );
}

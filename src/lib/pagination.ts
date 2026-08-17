import { useEffect, useMemo, useState } from "react";

/** Platform-wide batch size for every long list. */
export const PAGE_SIZE = 25;

/**
 * Incremental windowing over an already-loaded array (client-side lists).
 *
 * The window resets to the first batch whenever `resetKey` changes, so search
 * and filter changes always re-paginate from the top instead of paging inside
 * a stale window.
 */
export function usePagedList<T>(
  items: T[],
  options: { pageSize?: number; resetKey?: unknown } = {},
) {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const resetKey = options.resetKey;
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);

  return {
    visible,
    shown: visible.length,
    total: items.length,
    hasMore: items.length > visible.length,
    loadMore: () => setCount((c) => c + pageSize),
    reset: () => setCount(pageSize),
    isLoadingMore: false as boolean,
  };
}

/** Flattens `useInfiniteQuery` pages into one array. */
export function flattenPages<T>(pages: T[][] | undefined): T[] {
  return (pages ?? []).flat();
}

/**
 * Standard `getNextPageParam` for offset-based server pagination: keep paging
 * while the last page came back full.
 */
export function nextOffsetParam(pageSize: number) {
  return (lastPage: unknown[], allPages: unknown[][]) =>
    lastPage.length < pageSize ? undefined : allPages.reduce((n, p) => n + p.length, 0);
}

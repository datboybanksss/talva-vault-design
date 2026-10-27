import type { PostgrestError } from "@supabase/supabase-js";
import { databaseError } from "./security-errors";

type QueryResult<T> = { data: T | null; error: PostgrestError | null };

export function checkRows<T>(res: QueryResult<T[]>): T[] {
  if (res.error) throw databaseError(res.error);
  return res.data ?? [];
}

export function checkRow<T>(res: QueryResult<T>): T | null {
  if (res.error) throw databaseError(res.error);
  return res.data;
}

/** Read stable, ordered pages until exhausted, including servers with a lower row cap. */
export async function allQueryRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<QueryResult<T[]>>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (;;) {
    const page = checkRows(await fetchPage(rows.length, rows.length + pageSize - 1));
    if (page.length === 0) return rows;
    rows.push(...page);
  }
}
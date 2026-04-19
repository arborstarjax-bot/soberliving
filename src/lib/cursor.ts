/**
 * Cursor-based pagination helpers for large server-rendered lists.
 *
 * Why cursors over OFFSET: once a table grows past ~10k rows
 * `range(20_000, 20_019)` forces Postgres to scan + discard the
 * preceding rows on every click. A cursor keyed on a stable
 * `(created_at desc, id desc)` sort is O(log n) per page forever —
 * the server just runs `WHERE (created_at, id) < (:ts, :id) LIMIT 21`.
 *
 * Usage in a server component:
 *
 *   const cursor = parseCursor(searchParams.c);
 *   let q = supabase.from("bulletin_posts")
 *     .select("id, created_at, title, ...")
 *     .order("created_at", { ascending: false })
 *     .order("id", { ascending: false })
 *     .limit(DEFAULT_PAGE_SIZE + 1);
 *   q = applyCursor(q, cursor);
 *   const { data } = await q;
 *   const { rows, nextCursor } = sliceForPage(data ?? [], DEFAULT_PAGE_SIZE);
 *
 * The client `<CursorPager>` component consumes `{ nextCursor }` and
 * renders Next / Prev buttons whose hrefs mutate the `c=` param.
 */

import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export const DEFAULT_PAGE_SIZE = 20;

export interface Cursor {
  /** ISO timestamp of the boundary row's `created_at`. */
  ts: string;
  /** UUID of the boundary row — breaks ties when two rows share `created_at`. */
  id: string;
}

/**
 * Encode a cursor for use in a URL. We stringify to JSON and then
 * base64url so the string survives query parsing without percent
 * encoding every character.
 */
export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64url");
  }
  // Fallback for edge runtimes: atob/btoa + URL-safe replacements
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(json)))
      : json;
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Parse a cursor from a URL search param. Returns `null` for
 * missing, malformed, or non-object values — callers should treat
 * that as "first page".
 */
export function parseCursor(
  raw: string | string[] | undefined | null
): Cursor | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const padded = value.padEnd(
      value.length + ((4 - (value.length % 4)) % 4),
      "="
    );
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(padded, "base64url").toString("utf-8");
    } else {
      const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
      json =
        typeof atob === "function"
          ? decodeURIComponent(escape(atob(b64)))
          : b64;
    }
    const parsed = JSON.parse(json) as Partial<Cursor>;
    if (
      typeof parsed?.ts !== "string" ||
      typeof parsed?.id !== "string" ||
      !parsed.ts ||
      !parsed.id
    ) {
      return null;
    }
    return { ts: parsed.ts, id: parsed.id };
  } catch {
    return null;
  }
}

export interface ApplyCursorOptions {
  /** Timestamp (or other sort-key) column name. Default: `created_at`. */
  tsColumn?: string;
  /** Secondary tie-breaker column. Default: `id`. */
  idColumn?: string;
  /**
   * Sort direction — must match the caller's `.order(...)` clauses.
   * `"desc"` (default) uses a `<` predicate (newest-first feeds).
   * `"asc"` uses a `>` predicate (e.g. upcoming ride shares sorted
   * by departure time ascending).
   */
  direction?: "asc" | "desc";
}

/**
 * Apply a cursor predicate to a Supabase query. The query must
 * already include matching `.order(...)` clauses. For descending
 * order this translates to:
 *
 *   (ts_col, id_col) < (:ts, :id)
 *   ≡ ts_col < :ts OR (ts_col = :ts AND id_col < :id)
 *
 * which PostgREST exposes via `.or("...")`. For ascending order the
 * comparison flips to `>`.
 */
export function applyCursor<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TBuilder extends PostgrestFilterBuilder<any, any, any, any, any>,
>(
  query: TBuilder,
  cursor: Cursor | null,
  options: ApplyCursorOptions = {}
): TBuilder {
  if (!cursor) return query;
  const tsCol = options.tsColumn ?? "created_at";
  const idCol = options.idColumn ?? "id";
  const cmp = (options.direction ?? "desc") === "desc" ? "lt" : "gt";
  return query.or(
    `${tsCol}.${cmp}.${cursor.ts},and(${tsCol}.eq.${cursor.ts},${idCol}.${cmp}.${cursor.id})`
  ) as TBuilder;
}

/**
 * We fetch `pageSize + 1` rows so we can tell whether there's a next
 * page without a separate COUNT query. Returns the trimmed list and
 * a cursor pointing at the last kept row.
 *
 * For the default `(created_at desc, id desc)` sort, omit
 * `extractCursor`. For other sort keys (e.g. ride shares sorted by
 * `(departure_at asc, post_id asc)`), pass a function that pulls
 * the cursor fields off the last kept row.
 */
export function sliceForPage<T>(
  rows: T[],
  pageSize: number = DEFAULT_PAGE_SIZE,
  extractCursor?: (row: T) => Cursor
): { rows: T[]; nextCursor: Cursor | null } {
  if (rows.length <= pageSize) {
    return { rows, nextCursor: null };
  }
  const kept = rows.slice(0, pageSize);
  const last = kept[kept.length - 1];
  const extract =
    extractCursor ??
    ((r: T) => {
      const row = r as unknown as { id: string; created_at: string };
      return { ts: row.created_at, id: row.id };
    });
  return {
    rows: kept,
    nextCursor: extract(last),
  };
}

/**
 * Build a URL for a cursor link that preserves all unrelated search
 * params. Pass `null` to land back on the first page (removes `c`).
 */
export function buildCursorHref(
  basePath: string,
  currentParams: Record<string, string | string[] | undefined>,
  nextCursor: Cursor | null,
  cursorParam: string = "c"
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (key === cursorParam) continue;
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    } else {
      sp.set(key, value);
    }
  }
  if (nextCursor) sp.set(cursorParam, encodeCursor(nextCursor));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

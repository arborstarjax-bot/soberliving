// Pagination helpers for server components that page through large tables.
//
// Usage in a server component:
//
//   const { page, offset, pageSize } = getPageParams(searchParams);
//   const { data, count } = await supabase
//     .from("activity_log")
//     .select("*", { count: "exact" })
//     .range(offset, offset + pageSize - 1);
//   const meta = buildPaginationMeta(count ?? 0, page);
//
// The client-side `<Pagination>` component consumes the meta object and
// renders Prev / Next / "Page X of Y" with links that preserve the rest
// of the current query string so filters and tabs survive navigation.

export const DEFAULT_PAGE_SIZE = 20;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  from: number; // 1-based index of first item on this page (inclusive)
  to: number; // 1-based index of last item on this page (inclusive)
}

// Accept the same `searchParams` shape Next.js passes to server components.
// `value` can be a string, an array, or undefined, so normalize here.
function readString(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const v = searchParams?.[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function getPageParams(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  pageSize: number = DEFAULT_PAGE_SIZE
): { page: number; offset: number; pageSize: number } {
  const raw = readString(searchParams, "page");
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return { page, offset: (page - 1) * pageSize, pageSize };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE
): PaginationMeta {
  const safeTotal = Math.max(0, total);
  const totalPages = safeTotal === 0 ? 1 : Math.ceil(safeTotal / pageSize);
  // Clamp page if it's beyond the last page (e.g. user deleted items and
  // refreshed an old URL).
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = safeTotal === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, safeTotal);
  return {
    page: safePage,
    pageSize,
    total: safeTotal,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    from,
    to,
  };
}

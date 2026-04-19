import { createAdminClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { BulletinFeed } from "./bulletin-feed";
import { CursorPager } from "@/components/cursor-pager";
import {
  DEFAULT_PAGE_SIZE,
  applyCursor,
  buildCursorHref,
  encodeCursor,
  parseCursor,
  sliceForPage,
  type Cursor,
} from "@/lib/cursor";

type AuthorWithSobriety = {
  full_name: string;
  user_roles: Array<{ role: string }> | { role: string } | null;
  residents:
    | Array<{ sobriety_date: string | null; status: string | null }>
    | { sobriety_date: string | null; status: string | null }
    | null;
};

/**
 * From the residents rows joined onto a users author, pick the
 * sobriety_date of the currently active resident row.
 */
function pickActiveSobrietyDate(
  residents: AuthorWithSobriety["residents"] | undefined
): string | null {
  if (!residents) return null;
  const list = Array.isArray(residents) ? residents : [residents];
  const active = list.find((r) => r?.status === "active");
  return active?.sobriety_date ?? null;
}

/** Parse photo_url field — handles both legacy single URL and new JSON array format. */
function parsePhotoUrls(raw: string | null): string[] {
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.filter(
          (u: unknown) => typeof u === "string" && u.length > 0
        );
    } catch {
      // fall through
    }
  }
  return [raw];
}

export interface BulletinFeedSectionProps {
  currentUserId: string;
  currentUserRole: UserRole;
  /**
   * House IDs the user can see posts for. `null` = all houses
   * (admin). Empty array = global-only posts.
   */
  visibleHouseIds: string[] | null;
  /**
   * Current URL search params — used to round-trip `c=` (cursor) and
   * preserve any unrelated query state on Prev / Next links.
   */
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Async server component that fetches and renders the bulletin feed.
 * Wrap in `<Suspense>` on the page so the shell renders instantly
 * while this streams in. Uses cursor pagination keyed on
 * `(created_at desc, id desc)` and fetches at most `DEFAULT_PAGE_SIZE`
 * rows per request (+1 to detect the next page).
 */
export async function BulletinFeedSection({
  currentUserId,
  currentUserRole,
  visibleHouseIds,
  searchParams,
}: BulletinFeedSectionProps) {
  const supabase = createAdminClient();
  const cursor = parseCursor(searchParams.c);
  const prevCursor = parseCursor(searchParams.cp);

  const select =
    "id, created_at, author_id, title, content, photo_url, is_pinned, " +
    "author:users!author_id(full_name, user_roles(role), residents(sobriety_date, status)), " +
    "house:houses(name)";

  // Exclude ride_share posts — those render on their own tab.
  // `post_type.is.null` keeps legacy rows predating the column.
  const postTypeFilter = "post_type.eq.standard,post_type.is.null";

  // Pinned posts are always shown at the top of the feed, on every
  // page. Only the non-pinned tail is paginated.
  let pinnedQuery = supabase
    .from("bulletin_posts")
    .select(select)
    .eq("is_pinned", true)
    .or(postTypeFilter)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  let nonPinnedQuery = supabase
    .from("bulletin_posts")
    .select(select)
    .eq("is_pinned", false)
    .or(postTypeFilter)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(DEFAULT_PAGE_SIZE + 1);

  nonPinnedQuery = applyCursor(nonPinnedQuery, cursor);

  if (visibleHouseIds && visibleHouseIds.length > 0) {
    const orFilter = `house_id.in.(${visibleHouseIds.join(",")}),house_id.is.null`;
    pinnedQuery = pinnedQuery.or(orFilter);
    nonPinnedQuery = nonPinnedQuery.or(orFilter);
  } else if (visibleHouseIds) {
    pinnedQuery = pinnedQuery.is("house_id", null);
    nonPinnedQuery = nonPinnedQuery.is("house_id", null);
  }

  type RawPost = {
    id: string;
    created_at: string;
    author_id: string;
    title: string;
    content: string;
    photo_url: string | null;
    is_pinned: boolean;
    author:
      | AuthorWithSobriety
      | Array<AuthorWithSobriety>
      | null;
    house:
      | { name: string }
      | Array<{ name: string }>
      | null;
  };

  const [pinnedRes, nonPinnedRes] = await Promise.all([
    pinnedQuery,
    nonPinnedQuery,
  ]);
  const pinnedPosts = (pinnedRes.data ?? []) as unknown as RawPost[];
  const { rows: nonPinnedPosts, nextCursor } = sliceForPage<RawPost>(
    (nonPinnedRes.data ?? []) as unknown as RawPost[],
    DEFAULT_PAGE_SIZE
  );

  const posts: RawPost[] = [...pinnedPosts, ...nonPinnedPosts];
  const postIds = posts.map((p) => p.id);

  const likesMap: Record<string, number> = {};
  const userLikedSet = new Set<string>();
  type CommentEntry = {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    author_name: string;
    author_role: string;
    author_sobriety_date: string | null;
  };
  const commentsMap: Record<string, CommentEntry[]> = {};

  if (postIds.length > 0) {
    const [{ data: likes }, { data: comments }] = await Promise.all([
      supabase
        .from("bulletin_likes")
        .select("post_id, user_id")
        .in("post_id", postIds),
      supabase
        .from("bulletin_comments")
        .select(
          "id, post_id, user_id, content, created_at, author:users!user_id(full_name, user_roles(role), residents(sobriety_date, status))"
        )
        .in("post_id", postIds)
        .order("created_at", { ascending: true }),
    ]);

    for (const like of likes ?? []) {
      const pid = like.post_id as string;
      likesMap[pid] = (likesMap[pid] ?? 0) + 1;
      if (like.user_id === currentUserId) userLikedSet.add(pid);
    }

    for (const c of comments ?? []) {
      const authorData = Array.isArray(c.author)
        ? (c.author as Array<AuthorWithSobriety>)[0]
        : (c.author as AuthorWithSobriety | null);
      const roleRaw = authorData?.user_roles;
      const role = Array.isArray(roleRaw)
        ? roleRaw[0]?.role ?? "resident"
        : (roleRaw as { role: string } | null)?.role ?? "resident";
      const entry: CommentEntry = {
        id: c.id as string,
        user_id: c.user_id as string,
        content: c.content as string,
        created_at: c.created_at as string,
        author_name: authorData?.full_name ?? "Unknown",
        author_role: role,
        author_sobriety_date: pickActiveSobrietyDate(authorData?.residents),
      };
      const pid = c.post_id as string;
      if (!commentsMap[pid]) commentsMap[pid] = [];
      commentsMap[pid].push(entry);
    }
  }

  const normalizedPosts = posts.map((post) => {
    const authorData = Array.isArray(post.author)
      ? (post.author as Array<AuthorWithSobriety>)[0]
      : (post.author as AuthorWithSobriety | null);
    const roleRaw = authorData?.user_roles;
    const authorRole = Array.isArray(roleRaw)
      ? roleRaw[0]?.role ?? "resident"
      : (roleRaw as { role: string } | null)?.role ?? "resident";
    const houseName = Array.isArray(post.house)
      ? (post.house as Array<{ name: string }>)[0]?.name
      : (post.house as { name: string } | null)?.name;
    const pid = post.id as string;
    return {
      id: pid,
      author_id: post.author_id as string,
      title: post.title as string,
      content: post.content as string,
      photo_urls: parsePhotoUrls(post.photo_url as string | null),
      is_pinned: post.is_pinned as boolean,
      created_at: post.created_at as string,
      author_name: authorData?.full_name ?? "Unknown",
      author_role: authorRole,
      author_sobriety_date: pickActiveSobrietyDate(authorData?.residents),
      house_name: houseName ?? null,
      like_count: likesMap[pid] ?? 0,
      user_liked: userLikedSet.has(pid),
      comments: commentsMap[pid] ?? [],
    };
  });

  // Build Prev/Next hrefs. "Prev" is a back-stack of cursors passed
  // in via `cp=` (comma-separated stack of base64 cursors). If no cp,
  // Prev drops `c=` entirely, which lands on page 1.
  const cpRaw = searchParams.cp;
  const cpList: string[] = Array.isArray(cpRaw)
    ? cpRaw.filter(Boolean)
    : cpRaw
      ? cpRaw.split(",").filter(Boolean)
      : [];

  const prevHref = buildPrevHref(searchParams, cpList, cursor);
  const nextHref = nextCursor
    ? buildNextHref(searchParams, cpList, cursor, nextCursor)
    : null;

  // prevCursor is reserved for future explicit-back behavior —
  // right now Prev is derived from the cp back-stack instead.
  void prevCursor;

  return (
    <>
      <BulletinFeed
        posts={normalizedPosts}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />
      <CursorPager
        prevHref={prevHref}
        nextHref={nextHref}
        itemLabel="posts"
      />
    </>
  );
}

/**
 * Prev walks back the `cp=` back-stack. On page 1 (`currentCursor`
 * is null), Prev is disabled. On page 2 (cpList empty) it strips
 * both `c` and `cp` to return to page 1. Otherwise it pops the last
 * encoded cursor off the stack, decodes it, and passes it as
 * `nextCursor` to `buildCursorHref` — the cursor param must travel
 * through that slot because `buildCursorHref` strips it from
 * `currentParams` by design.
 */
function buildPrevHref(
  searchParams: Record<string, string | string[] | undefined>,
  cpList: string[],
  currentCursor: Cursor | null
): string | null {
  if (!currentCursor) return null;
  const params: Record<string, string | string[] | undefined> = {
    ...searchParams,
  };
  if (cpList.length === 0) {
    return buildCursorHref(
      "/bulletin",
      { ...params, cp: undefined, c: undefined },
      null,
      "c"
    );
  }
  const newStack = cpList.slice(0, -1);
  const prevCursorEncoded = cpList[cpList.length - 1];
  const prevCursor = parseCursor(prevCursorEncoded);
  return buildCursorHref(
    "/bulletin",
    { ...params, cp: newStack.length ? newStack.join(",") : undefined },
    prevCursor,
    "c"
  );
}

/**
 * Next advances to `nextCursor` and pushes the cursor we arrived
 * with onto the back-stack so Prev returns here. On page 1
 * (`currentCursor` is null) there is nothing to push — Prev on page
 * 2 handles the empty-stack case by stripping `c`.
 */
function buildNextHref(
  searchParams: Record<string, string | string[] | undefined>,
  cpList: string[],
  currentCursor: Cursor | null,
  nextCursor: Cursor
): string {
  const params: Record<string, string | string[] | undefined> = {
    ...searchParams,
  };
  const newStack = currentCursor
    ? [...cpList, encodeCursor(currentCursor)]
    : cpList;
  params.cp = newStack.length ? newStack.join(",") : undefined;
  return buildCursorHref("/bulletin", params, nextCursor, "c");
}

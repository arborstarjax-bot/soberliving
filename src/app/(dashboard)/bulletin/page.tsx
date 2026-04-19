import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { BulletinFeed } from "./bulletin-feed";
import { NewPostForm } from "./new-post-form";
import { Pagination } from "@/components/pagination";
import { getPageParams, buildPaginationMeta } from "@/lib/pagination";
import { RefreshOnMount } from "@/components/refresh-on-mount";
import { ensureMilestonePosts } from "@/lib/sobriety-milestones";

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
 * sobriety_date of the currently active resident row. A single user
 * can have multiple historical resident records (past moves between
 * houses); we always surface the *active* one for the chip. Returns
 * null when there is no active row or no date set.
 */
function pickActiveSobrietyDate(
  residents: AuthorWithSobriety["residents"] | undefined
): string | null {
  if (!residents) return null;
  const list = Array.isArray(residents) ? residents : [residents];
  const active = list.find((r) => r?.status === "active");
  return active?.sobriety_date ?? null;
}

/** Parse photo_url field — handles both legacy single URL and new JSON array format */
function parsePhotoUrls(raw: string | null): string[] {
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u: unknown) => typeof u === "string" && u.length > 0);
    } catch {
      // fall through to single URL
    }
  }
  return [raw];
}

interface BulletinPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BulletinPage({ searchParams }: BulletinPageProps) {
  const user = await requireAuth();
  const supabase = createAdminClient();
  const houseFilter = getAccessibleHouseFilter(user);

  const params = await searchParams;
  const { page, offset, pageSize } = getPageParams(params);

  // Bump this user's last_seen_bulletin_at so the sidebar unread
  // badge clears on the next layout render. Counterpart to the
  // unreadBulletinCount query in (dashboard)/layout.tsx — "viewing
  // the bulletin board" is the read event. `<RefreshOnMount />`
  // below invalidates the router cache client-side so the sidebar
  // re-renders with the fresh count.
  await supabase
    .from("users")
    .update({ last_seen_bulletin_at: new Date().toISOString() })
    .eq("id", user.id);

  // Post auto-congrats for any resident who has crossed a new sobriety
  // milestone since the last time we checked. No-op inside the
  // in-memory debounce window (see ensureMilestonePosts) and safe to
  // call unconditionally — UNIQUE(resident_user_id, milestone_days)
  // prevents duplicates across concurrent renders.
  await ensureMilestonePosts(supabase);

  // Determine which houses the user can post to
  let postableHouses: { id: string; name: string }[] = [];

  if (user.role === "admin") {
    const { data } = await supabase
      .from("houses")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    postableHouses = data ?? [];
  } else if (user.role === "manager") {
    if (user.assigned_house_ids.length > 0) {
      const { data } = await supabase
        .from("houses")
        .select("id, name")
        .in("id", user.assigned_house_ids)
        .eq("is_active", true)
        .order("name");
      postableHouses = data ?? [];
    }
  } else {
    // Resident — find their house
    const { data: resident } = await supabase
      .from("residents")
      .select("house_id, house:houses!inner(id, name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (resident) {
      const house = resident.house as unknown as { id: string; name: string };
      postableHouses = [{ id: house.id, name: house.name }];
    }
  }

  // Determine which house IDs the user can see posts from
  let visibleHouseIds: string[] | null = null; // null = all
  if (user.role === "resident") {
    visibleHouseIds = postableHouses.length > 0 ? postableHouses.map((h) => h.id) : [];
  } else if (user.role === "manager") {
    visibleHouseIds = houseFilter && houseFilter.length > 0 ? houseFilter : [];
  }

  // Fetch pinned and non-pinned posts separately so pinned posts always
  // show at the top regardless of which page the user is on, and only
  // the non-pinned tail is paginated (20 per page).
  const pinnedSelect =
    "*, author:users!author_id(full_name, user_roles(role), residents(sobriety_date, status)), house:houses(name)";

  // Exclude ride_share posts — those render on their own tab at
  // /bulletin/ride-share. `.or("post_type.eq.standard,post_type.is.null")`
  // keeps rows that predate the post_type column (NULL) alongside the
  // new 'standard' default.
  const postTypeFilter = "post_type.eq.standard,post_type.is.null";

  let pinnedQuery = supabase
    .from("bulletin_posts")
    .select(pinnedSelect)
    .eq("is_pinned", true)
    .or(postTypeFilter)
    .order("created_at", { ascending: false });

  let nonPinnedQuery = supabase
    .from("bulletin_posts")
    .select(pinnedSelect, { count: "exact" })
    .eq("is_pinned", false)
    .or(postTypeFilter)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Filter: show posts for user's houses + global posts (house_id IS NULL).
  // Applied identically to both pinned and non-pinned queries.
  if (visibleHouseIds && visibleHouseIds.length > 0) {
    const orFilter = `house_id.in.(${visibleHouseIds.join(",")}),house_id.is.null`;
    pinnedQuery = pinnedQuery.or(orFilter);
    nonPinnedQuery = nonPinnedQuery.or(orFilter);
  } else if (visibleHouseIds) {
    // Empty array = user has access to no houses, only show global posts.
    pinnedQuery = pinnedQuery.is("house_id", null);
    nonPinnedQuery = nonPinnedQuery.is("house_id", null);
  }

  const [pinnedRes, nonPinnedRes] = await Promise.all([
    pinnedQuery,
    nonPinnedQuery,
  ]);

  const pinnedPosts = pinnedRes.data ?? [];
  const nonPinnedPosts = nonPinnedRes.data ?? [];
  const posts = [...pinnedPosts, ...nonPinnedPosts];

  const paginationMeta = buildPaginationMeta(
    nonPinnedRes.count ?? 0,
    page,
    pageSize
  );

  // Fetch likes and comments for all returned posts
  const postIds = (posts ?? []).map((p) => p.id as string);
  const likesMap: Record<string, number> = {};
  const userLikedSet = new Set<string>();
  const commentsMap: Record<string, Array<{ id: string; user_id: string; content: string; created_at: string; author_name: string; author_role: string; author_sobriety_date: string | null }>> = {};

  if (postIds.length > 0) {
    const { data: likes } = await supabase
      .from("bulletin_likes")
      .select("post_id, user_id")
      .in("post_id", postIds);

    for (const like of likes ?? []) {
      likesMap[like.post_id as string] = (likesMap[like.post_id as string] ?? 0) + 1;
      if (like.user_id === user.id) userLikedSet.add(like.post_id as string);
    }

    const { data: comments } = await supabase
      .from("bulletin_comments")
      .select("id, post_id, user_id, content, created_at, author:users!user_id(full_name, user_roles(role), residents(sobriety_date, status))")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    for (const c of comments ?? []) {
      const authorData = Array.isArray(c.author)
        ? (c.author as Array<AuthorWithSobriety>)[0]
        : (c.author as AuthorWithSobriety | null);

      const roleRaw = authorData?.user_roles;
      const role = Array.isArray(roleRaw) ? roleRaw[0]?.role ?? "resident" : (roleRaw as { role: string } | null)?.role ?? "resident";

      const entry = {
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

  // Normalize for client
  const normalizedPosts = (posts ?? []).map((post) => {
    const authorData = Array.isArray(post.author)
      ? (post.author as Array<AuthorWithSobriety>)[0]
      : (post.author as AuthorWithSobriety | null);

    const roleRaw = authorData?.user_roles;
    const authorRole = Array.isArray(roleRaw) ? roleRaw[0]?.role ?? "resident" : (roleRaw as { role: string } | null)?.role ?? "resident";

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

  return (
    <div className="space-y-6">
      <RefreshOnMount />
      <NewPostForm
        houses={postableHouses}
        userRole={user.role}
        singleHouse={user.role === "resident" && postableHouses.length === 1}
      />

      <BulletinFeed
        posts={normalizedPosts}
        currentUserId={user.id}
        currentUserRole={user.role}
      />

      {/*
        Pagination meta is scoped to NON-PINNED posts only — pinned posts
        are rendered above and repeated on every page. The `itemLabel`
        reflects that so the summary row matches what's actually being
        paged through (e.g. "Showing 1–20 of 80 non-pinned posts").
      */}
      <Pagination
        meta={paginationMeta}
        basePath="/bulletin"
        searchParams={params}
        itemLabel={`non-pinned post${paginationMeta.total === 1 ? "" : "s"}`}
      />
    </div>
  );
}

import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { BulletinFeed } from "./bulletin-feed";
import { NewPostForm } from "./new-post-form";

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

export default async function BulletinPage() {
  const user = await requireAuth();
  const supabase = createAdminClient();
  const houseFilter = getAccessibleHouseFilter(user);

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

  // Fetch posts with author role info and house name
  let postsQuery = supabase
    .from("bulletin_posts")
    .select("*, author:users!author_id(full_name, user_roles(role)), house:houses(name)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  // Filter: show posts for user's houses + global posts (house_id IS NULL)
  if (visibleHouseIds && visibleHouseIds.length > 0) {
    postsQuery = postsQuery.or(`house_id.in.(${visibleHouseIds.join(",")}),house_id.is.null`);
  } else if (visibleHouseIds) {
    // Empty array = user has access to no houses, only show global posts
    postsQuery = postsQuery.is("house_id", null);
  }

  const { data: posts } = await postsQuery;

  // Fetch likes and comments for all returned posts
  const postIds = (posts ?? []).map((p) => p.id as string);
  const likesMap: Record<string, number> = {};
  const userLikedSet = new Set<string>();
  const commentsMap: Record<string, Array<{ id: string; user_id: string; content: string; created_at: string; author_name: string; author_role: string }>> = {};

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
      .select("id, post_id, user_id, content, created_at, author:users!user_id(full_name, user_roles(role))")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    for (const c of comments ?? []) {
      const authorData = Array.isArray(c.author)
        ? (c.author as Array<{ full_name: string; user_roles: Array<{ role: string }> | { role: string } | null }>)[0]
        : (c.author as { full_name: string; user_roles: Array<{ role: string }> | { role: string } | null } | null);

      const roleRaw = authorData?.user_roles;
      const role = Array.isArray(roleRaw) ? roleRaw[0]?.role ?? "resident" : (roleRaw as { role: string } | null)?.role ?? "resident";

      const entry = {
        id: c.id as string,
        user_id: c.user_id as string,
        content: c.content as string,
        created_at: c.created_at as string,
        author_name: authorData?.full_name ?? "Unknown",
        author_role: role,
      };
      const pid = c.post_id as string;
      if (!commentsMap[pid]) commentsMap[pid] = [];
      commentsMap[pid].push(entry);
    }
  }

  // Normalize for client
  const normalizedPosts = (posts ?? []).map((post) => {
    const authorData = Array.isArray(post.author)
      ? (post.author as Array<{ full_name: string; user_roles: Array<{ role: string }> | { role: string } | null }>)[0]
      : (post.author as { full_name: string; user_roles: Array<{ role: string }> | { role: string } | null } | null);

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
      house_name: houseName ?? null,
      like_count: likesMap[pid] ?? 0,
      user_liked: userLikedSet.has(pid),
      comments: commentsMap[pid] ?? [],
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bulletin Board</h1>
          <p className="text-muted-foreground">
            Announcements and messages for residents and staff
          </p>
        </div>
      </div>

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
    </div>
  );
}

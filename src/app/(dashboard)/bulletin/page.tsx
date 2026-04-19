import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessibleHouseFilter } from "@/lib/permissions";
import { NewPostForm } from "./new-post-form";
import { BulletinFeedSection } from "./bulletin-feed-section";
import { ListSkeleton } from "@/components/ui/skeleton";
import { RefreshOnMount } from "@/components/refresh-on-mount";
import { ensureMilestonePosts } from "@/lib/sobriety-milestones";

interface BulletinPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BulletinPage({ searchParams }: BulletinPageProps) {
  const user = await requireAuth();
  const supabase = createAdminClient();
  const houseFilter = getAccessibleHouseFilter(user);
  const params = await searchParams;

  // Bump this user's last_seen_bulletin_at so the sidebar unread
  // badge clears on the next layout render. `<RefreshOnMount />`
  // below invalidates the router cache client-side so the sidebar
  // re-renders with the fresh count.
  await supabase
    .from("users")
    .update({ last_seen_bulletin_at: new Date().toISOString() })
    .eq("id", user.id);

  // Post auto-congrats for any resident who has crossed a new
  // sobriety milestone since the last time we checked. No-op inside
  // the in-memory debounce window and safe to call unconditionally —
  // UNIQUE(resident_user_id, milestone_days) prevents duplicates
  // across concurrent renders.
  await ensureMilestonePosts(supabase);

  // Determine which houses the user can post to. Kept in the shell
  // (not Suspense'd) because NewPostForm renders above the feed and
  // is small — a couple of fast indexed lookups by role.
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

  // Determine which house IDs the user can see posts from.
  let visibleHouseIds: string[] | null = null; // null = all
  if (user.role === "resident") {
    visibleHouseIds =
      postableHouses.length > 0 ? postableHouses.map((h) => h.id) : [];
  } else if (user.role === "manager") {
    visibleHouseIds = houseFilter && houseFilter.length > 0 ? houseFilter : [];
  }

  // Suspense key: any change to cursor / filters should reset the
  // fallback skeleton instead of reusing a stale one. React uses
  // this to decide whether the next render can reuse the current
  // children.
  const suspenseKey = `c=${(Array.isArray(params.c) ? params.c[0] : params.c) ?? ""}&cp=${
    (Array.isArray(params.cp) ? params.cp[0] : params.cp) ?? ""
  }`;

  return (
    <div className="space-y-6">
      <RefreshOnMount />
      <NewPostForm
        houses={postableHouses}
        userRole={user.role}
        singleHouse={user.role === "resident" && postableHouses.length === 1}
      />

      <Suspense
        key={suspenseKey}
        fallback={<ListSkeleton rows={6} rowClassName="h-32 w-full" />}
      >
        <BulletinFeedSection
          currentUserId={user.id}
          currentUserRole={user.role}
          visibleHouseIds={visibleHouseIds}
          searchParams={params}
        />
      </Suspense>
    </div>
  );
}

import { createAdminClient } from "@/lib/supabase/server";
import { getCachedActiveHouses } from "@/lib/cached-dropdowns";
import type { BlockerTargetType, SessionUser } from "@/lib/types";
import { BlockersList } from "./blockers-list";

/**
 * Heavy fetch for the Notices list — blockers + ack counts + target
 * counts. Lives behind its own `<Suspense>` so the composer card
 * above can appear first (it has its own Suspense island) and the
 * shell paints immediately.
 */
export async function BlockersListSection({ user }: { user: SessionUser }) {
  const admin = createAdminClient();

  let residentsQuery = admin
    .from("residents")
    .select("user_id, house_id")
    .eq("status", "active");
  if (user.role === "manager") {
    residentsQuery = residentsQuery.in("house_id", user.assigned_house_ids);
  }

  let blockersQuery = admin
    .from("blockers")
    .select(
      "id, title, body, attachment_paths, target_type, target_house_ids, target_user_ids, save_to_docs, created_by, created_at, archived_at, author:users!created_by(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (user.role === "manager") {
    blockersQuery = blockersQuery.eq("created_by", user.id);
  }

  const [allHouses, { data: residentRows }, { data: blockers }] =
    await Promise.all([
      getCachedActiveHouses(),
      residentsQuery,
      blockersQuery,
    ]);

  const houses =
    user.role === "manager"
      ? allHouses.filter((h) => user.assigned_house_ids.includes(h.id))
      : allHouses;

  const residents = (residentRows ?? []).map((r) => ({
    user_id: r.user_id as string,
    house_id: r.house_id as string,
  }));

  const blockerIds = (blockers ?? []).map((b) => b.id as string);
  const ackByBlocker = new Map<string, number>();
  if (blockerIds.length > 0) {
    const { data: acks } = await admin
      .from("blocker_acknowledgments")
      .select("blocker_id")
      .in("blocker_id", blockerIds);
    for (const a of acks ?? []) {
      const id = a.blocker_id as string;
      ackByBlocker.set(id, (ackByBlocker.get(id) ?? 0) + 1);
    }
  }

  const allResidentCount = residents.length;
  const countsByBlocker = new Map<string, number>();
  for (const b of blockers ?? []) {
    const t = b.target_type as BlockerTargetType;
    if (t === "all") {
      countsByBlocker.set(b.id as string, allResidentCount);
    } else if (t === "house") {
      const hids = (b.target_house_ids as string[] | null) ?? [];
      countsByBlocker.set(
        b.id as string,
        residents.filter((r) => hids.includes(r.house_id)).length
      );
    } else if (t === "residents") {
      const uids = (b.target_user_ids as string[] | null) ?? [];
      countsByBlocker.set(b.id as string, uids.length);
    }
  }

  const listItems = (blockers ?? []).map((b) => {
    const authorData = Array.isArray(b.author)
      ? (b.author as Array<{ full_name: string }>)[0]
      : (b.author as { full_name: string } | null);
    return {
      id: b.id as string,
      title: b.title as string,
      body: b.body as string,
      attachment_paths: (b.attachment_paths as string[] | null) ?? [],
      target_type: b.target_type as BlockerTargetType,
      target_house_ids: (b.target_house_ids as string[] | null) ?? [],
      target_user_ids: (b.target_user_ids as string[] | null) ?? [],
      save_to_docs: Boolean(b.save_to_docs),
      created_by: b.created_by as string,
      created_at: b.created_at as string,
      archived_at: (b.archived_at as string | null) ?? null,
      author_name: authorData?.full_name ?? "Unknown",
      ack_count: ackByBlocker.get(b.id as string) ?? 0,
      target_count: countsByBlocker.get(b.id as string) ?? 0,
    };
  });

  return (
    <BlockersList
      items={listItems}
      houses={houses ?? []}
      currentUserId={user.id}
      currentUserRole={user.role}
    />
  );
}

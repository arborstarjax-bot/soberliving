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
  if (user.role === "admin" && user.workspace_house_ids.length > 0) {
    residentsQuery = residentsQuery.in("house_id", user.workspace_house_ids);
  } else if (user.role === "admin" && user.workspace_id) {
    residentsQuery = residentsQuery.is("house_id", null);
  } else if (user.role === "manager") {
    residentsQuery = residentsQuery.in("house_id", user.assigned_house_ids);
  }

  // Scope blockers to workspace: fetch workspace user IDs so we can
  // filter blockers by author. Only admins/managers create blockers.
  let wsUserIds: string[] | null = null;
  if (user.role === "admin" && user.workspace_id) {
    const { data: wsUsers } = await admin
      .from("users")
      .select("id")
      .eq("workspace_id", user.workspace_id);
    wsUserIds = wsUsers?.map((u) => u.id) ?? [];
  }

  let blockersQuery = admin
    .from("blockers")
    .select(
      "id, title, body, attachment_paths, target_type, target_house_ids, target_user_ids, save_to_docs, require_signature, created_by, created_at, archived_at, author:users!created_by(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (wsUserIds && wsUserIds.length > 0) {
    blockersQuery = blockersQuery.in("created_by", wsUserIds);
  } else if (user.role === "manager") {
    blockersQuery = blockersQuery.eq("created_by", user.id);
  }

  const [allHouses, { data: residentRows }, { data: blockers }] =
    await Promise.all([
      getCachedActiveHouses(user.workspace_id),
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
  type AckEntry = {
    user_id: string;
    user_name: string;
    acknowledged_at: string;
    has_signature: boolean;
  };
  const acksByBlocker = new Map<string, AckEntry[]>();
  if (blockerIds.length > 0) {
    // Fetch metadata WITHOUT the signature column (those are
    // 10-30 KB dataURL PNGs). A second ultra-small query tells us
    // which (blocker_id, user_id) rows have a non-null signature
    // so we can flip the icon in the UI.
    const [metaRes, signedRes] = await Promise.all([
      admin
        .from("blocker_acknowledgments")
        .select(
          "blocker_id, user_id, acknowledged_at, user:users!user_id(full_name)"
        )
        .in("blocker_id", blockerIds)
        .order("acknowledged_at", { ascending: false }),
      admin
        .from("blocker_acknowledgments")
        .select("blocker_id, user_id")
        .in("blocker_id", blockerIds)
        .not("signature", "is", null),
    ]);
    const signedKeys = new Set<string>();
    for (const s of signedRes.data ?? []) {
      signedKeys.add(`${s.blocker_id}:${s.user_id}`);
    }
    for (const a of metaRes.data ?? []) {
      const id = a.blocker_id as string;
      const userData = Array.isArray(a.user)
        ? (a.user as Array<{ full_name: string }>)[0]
        : (a.user as { full_name: string } | null);
      const entry: AckEntry = {
        user_id: a.user_id as string,
        user_name: userData?.full_name ?? "Unknown",
        acknowledged_at: a.acknowledged_at as string,
        has_signature: signedKeys.has(`${a.blocker_id}:${a.user_id}`),
      };
      const list = acksByBlocker.get(id);
      if (list) list.push(entry);
      else acksByBlocker.set(id, [entry]);
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
      require_signature: b.require_signature !== false,
      created_by: b.created_by as string,
      created_at: b.created_at as string,
      archived_at: (b.archived_at as string | null) ?? null,
      author_name: authorData?.full_name ?? "Unknown",
      acknowledgments: acksByBlocker.get(b.id as string) ?? [],
      ack_count: (acksByBlocker.get(b.id as string) ?? []).length,
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

import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NewBlockerForm } from "./new-blocker-form";
import { BlockersList } from "./blockers-list";
import type { BlockerTargetType } from "@/lib/types";

export default async function BlockersPage() {
  const user = await requireAuth();

  if (user.role !== "admin" && user.role !== "manager") {
    redirect("/bulletin");
  }

  const admin = createAdminClient();

  // Houses + residents the current staff member is allowed to target.
  // Admins see everything; managers are restricted to their assigned
  // houses (same permission model as /bulletin New Post).
  let housesQuery = admin
    .from("houses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (user.role === "manager") {
    housesQuery = housesQuery.in("id", user.assigned_house_ids);
  }
  const { data: houses } = await housesQuery;

  let residentsQuery = admin
    .from("residents")
    .select("user_id, house_id, user:users!inner(id, full_name), house:houses!inner(id, name)")
    .eq("status", "active");
  if (user.role === "manager") {
    residentsQuery = residentsQuery.in("house_id", user.assigned_house_ids);
  }
  const { data: residentRows } = await residentsQuery;

  const residents = (residentRows ?? [])
    .map((r) => {
      const u = r.user as unknown as { id: string; full_name: string };
      const h = r.house as unknown as { id: string; name: string };
      return u && h
        ? {
            user_id: u.id,
            full_name: u.full_name,
            house_id: h.id,
            house_name: h.name,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Load the current blocker list (active first, archived below).
  // Managers only see their own authored blockers — admins see all.
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
  const { data: blockers } = await blockersQuery;

  // For each blocker we also want ack counts so the admin can see
  // "X of Y acknowledged" at a glance. Cheap to compute: pull all ack
  // rows for the loaded blocker ids, bucket in memory.
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

  // Targeted-count lookups per blocker. For 'all' we count all active
  // residents (globally for admin, within assigned houses for manager).
  // For 'house' we count residents in those houses. For 'residents'
  // it's just the length of target_user_ids.
  const allResidentCount = residents.length; // bounded by role scope already
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
    <div className="space-y-6">
      <NewBlockerForm
        houses={houses ?? []}
        residents={residents}
        userRole={user.role}
      />
      <BlockersList items={listItems} houses={houses ?? []} currentUserId={user.id} currentUserRole={user.role} />
    </div>
  );
}

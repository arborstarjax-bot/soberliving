"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

const DESTINATION_TYPES = ["meeting", "church", "store", "other"] as const;

const createRideSchema = z.object({
  houseId: z.string().uuid("House is required"),
  destinationType: z.enum(DESTINATION_TYPES),
  destinationLabel: z.string().trim().max(200).optional().nullable(),
  seatsTotal: z.coerce.number().int().min(1).max(8),
  // HTML <input type="date"> returns YYYY-MM-DD, <input type="time">
  // returns HH:MM. We combine them into a timestamptz at the resident
  // house's local time server-side below.
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateRideState = { error?: string; ok?: boolean };

/**
 * Resolve the house id the current user can post a ride for. Residents
 * can only post for their own active house; managers for assigned
 * houses; admins for any active house. Returns `null` if the id isn't
 * permitted.
 */
async function authorizeHouseForUser(houseId: string): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const user = await requireAuth();
  const admin = createAdminClient();

  if (user.role === "admin") return { ok: true };
  if (user.role === "manager") {
    return canAccessHouse(user, houseId)
      ? { ok: true }
      : { ok: false, reason: "Not assigned to this house" };
  }

  // Resident: must be the user's active house.
  const { data: resident } = await admin
    .from("residents")
    .select("house_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!resident || resident.house_id !== houseId) {
    return { ok: false, reason: "Not a resident of this house" };
  }
  return { ok: true };
}

export async function createRideShare(
  _prev: CreateRideState | undefined,
  formData: FormData
): Promise<CreateRideState> {
  const user = await requireAuth();

  const parsed = createRideSchema.safeParse({
    houseId: formData.get("house_id"),
    destinationType: formData.get("destination_type"),
    destinationLabel: formData.get("destination_label") || null,
    seatsTotal: formData.get("seats_total"),
    departureDate: formData.get("departure_date"),
    departureTime: formData.get("departure_time"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const {
    houseId,
    destinationType,
    destinationLabel,
    seatsTotal,
    departureDate,
    departureTime,
    notes,
  } = parsed.data;

  if (destinationType === "other" && !destinationLabel) {
    return { error: "Destination label is required for 'other'" };
  }

  const auth = await authorizeHouseForUser(houseId);
  if (!auth.ok) return { error: auth.reason };

  const admin = createAdminClient();

  // Compose a timestamptz from the date/time pair. We treat the submitted
  // time as America/New_York since every house today operates on Eastern
  // time (see formatDateOnly / formatDateTime in src/lib/timezone.ts).
  // Store as UTC.
  const departureAt = toEasternTimestamp(departureDate, departureTime);

  // 1. Create the bulletin_posts shell row (post_type='ride_share').
  const title = destinationLabel
    ? `Ride to ${destinationLabel}`
    : `Ride to ${capitalize(destinationType)}`;

  const { data: post, error: postError } = await admin
    .from("bulletin_posts")
    .insert({
      author_id: user.id,
      title,
      content: notes ?? "",
      house_id: houseId,
      post_type: "ride_share",
    })
    .select("id")
    .single();
  if (postError || !post) {
    return { error: postError?.message ?? "Failed to create ride share" };
  }

  // 2. Create the ride_shares extension row.
  const { error: rideError } = await admin.from("ride_shares").insert({
    post_id: post.id,
    destination_type: destinationType,
    destination_label: destinationLabel ?? null,
    seats_total: seatsTotal,
    departure_at: departureAt,
  });
  if (rideError) {
    await admin.from("bulletin_posts").delete().eq("id", post.id);
    return { error: rideError.message };
  }

  // 3. Auto-reserve the driver's seat. Uses the same RPC so overbook
  //    safety applies uniformly.
  const { error: reserveError } = await admin.rpc("reserve_ride_seat", {
    p_post_id: post.id,
    p_user_id: user.id,
  });
  if (reserveError) {
    // Driver auto-reserve failing isn't fatal to the ride — log and
    // continue; the driver can click Reserve themselves.
    console.error("driver auto-reserve failed", reserveError);
  }

  await logActivity({
    houseId,
    actorId: user.id,
    eventType: "ride_share_created",
    entityType: "ride_share",
    entityId: post.id as string,
    description: `${user.full_name} posted a ride share to ${
      destinationLabel ?? capitalize(destinationType)
    }`,
  });

  revalidatePath("/bulletin/ride-share");
  revalidatePath("/bulletin");
  return { ok: true };
}

export async function reserveRideSeat(
  postId: string
): Promise<{ error?: string; status?: "ok" | "already" | "full" | "not_found" }> {
  const user = await requireAuth();
  const admin = createAdminClient();

  // Visibility check: the ride's underlying bulletin_post must be in a
  // house the user can see.
  const visible = await userCanSeeRide(user.id, postId);
  if (!visible.ok) return { error: "Not authorized" };

  const { data: status, error } = await admin.rpc("reserve_ride_seat", {
    p_post_id: postId,
    p_user_id: user.id,
  });
  if (error) return { error: error.message };

  if (status === "ok") {
    await logActivity({
      actorId: user.id,
      eventType: "ride_share_reserved",
      entityType: "ride_share",
      entityId: postId,
      description: `${user.full_name} reserved a seat on a ride share`,
    });
  }

  revalidatePath("/bulletin/ride-share");
  return { status: status as "ok" | "already" | "full" | "not_found" };
}

export async function unreserveRideSeat(
  postId: string
): Promise<{ error?: string; removed?: boolean }> {
  const user = await requireAuth();
  const admin = createAdminClient();

  const visible = await userCanSeeRide(user.id, postId);
  if (!visible.ok) return { error: "Not authorized" };

  const { data: removed, error } = await admin.rpc("unreserve_ride_seat", {
    p_post_id: postId,
    p_user_id: user.id,
  });
  if (error) return { error: error.message };

  if (removed) {
    await logActivity({
      actorId: user.id,
      eventType: "ride_share_unreserved",
      entityType: "ride_share",
      entityId: postId,
      description: `${user.full_name} released a ride share seat`,
    });
  }

  revalidatePath("/bulletin/ride-share");
  return { removed: Boolean(removed) };
}

export async function deleteRideShare(postId: string): Promise<{ error?: string }> {
  const user = await requireAuth();
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("bulletin_posts")
    .select("id, author_id, house_id, title, post_type")
    .eq("id", postId)
    .eq("post_type", "ride_share")
    .maybeSingle();
  if (!post) return { error: "Ride share not found" };

  const isAuthor = post.author_id === user.id;
  const isAdmin = user.role === "admin";
  const isManagerForHouse =
    user.role === "manager" &&
    typeof post.house_id === "string" &&
    canAccessHouse(user, post.house_id);

  if (!isAuthor && !isAdmin && !isManagerForHouse) {
    return { error: "Not authorized" };
  }

  // Cascades to ride_shares + ride_share_reservations via FK ON DELETE CASCADE.
  const { error } = await admin.from("bulletin_posts").delete().eq("id", postId);
  if (error) return { error: error.message };

  await logActivity({
    houseId: (post.house_id as string | null) ?? undefined,
    actorId: user.id,
    eventType: "ride_share_deleted",
    entityType: "ride_share",
    entityId: postId,
    description: `${user.full_name} removed a ride share`,
  });

  revalidatePath("/bulletin/ride-share");
  return {};
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Whether `userId` is allowed to see the ride share with the given
 * post id. Mirrors the bulletin_posts visibility model.
 */
async function userCanSeeRide(
  userId: string,
  postId: string
): Promise<{ ok: true } | { ok: false }> {
  const user = await requireAuth();
  if (user.id !== userId) return { ok: false };

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("bulletin_posts")
    .select("id, house_id, post_type")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.post_type !== "ride_share") return { ok: false };
  const houseId = post.house_id as string | null;
  if (!houseId) return { ok: false };

  if (user.role === "admin") return { ok: true };
  if (user.role === "manager") {
    return canAccessHouse(user, houseId) ? { ok: true } : { ok: false };
  }

  // Resident — only their own active house.
  const { data: resident } = await admin
    .from("residents")
    .select("house_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return resident?.house_id === houseId ? { ok: true } : { ok: false };
}

/** Build a timestamptz from a date + time treated as America/New_York. */
function toEasternTimestamp(date: string, time: string): string {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const [y, mo, d] = date.split("-").map((n) => parseInt(n, 10));
  // Resolve the UTC instant whose Eastern wall-clock reads
  // `date`/`time` by iterating: guess UTC, check what offset Eastern
  // has at that instant, reapply. Two passes converge except inside
  // the DST spring-forward gap where the submitted time doesn't
  // exist — in that case we fall into the later offset and the ride
  // lands one hour later, which matches what calendars do.
  let utc = Date.UTC(y, mo - 1, d, h, m);
  for (let i = 0; i < 2; i++) {
    const offsetMs = easternOffsetMs(utc);
    utc = Date.UTC(y, mo - 1, d, h, m) - offsetMs;
  }
  return new Date(utc).toISOString();
}

/**
 * Returns the America/New_York UTC offset at the given UTC instant,
 * in milliseconds. Negative for Eastern (EST = -5h, EDT = -4h).
 */
function easternOffsetMs(utcMs: number): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  );
  const wallAsUtc = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    parseInt(parts.hour === "24" ? "0" : parts.hour, 10),
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10)
  );
  return wallAsUtc - utcMs;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

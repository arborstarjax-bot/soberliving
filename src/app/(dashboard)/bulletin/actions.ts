"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { canAccessHouse } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { sendWebPushToMany } from "@/lib/push";
import { z } from "zod";

/**
 * Return true if the user can see a bulletin post in the given
 * house (or a null-house global post). Mirrors the visibility rules
 * used by the bulletin feed:
 *  - workspace boundary: never a post from another workspace
 *  - admin: any post in their workspace
 *  - manager: any post in an assigned house, plus null-house posts
 *  - resident: only their own active house, plus null-house posts
 */
async function canSeeBulletinHouse(
  user: Awaited<ReturnType<typeof requireAuth>>,
  houseId: string | null,
  postWorkspaceId: string | null
): Promise<boolean> {
  // Workspace isolation is the outermost rule — it also covers
  // null-house "post to everyone" posts, which are only global within
  // a single workspace.
  if (
    user.workspace_id &&
    postWorkspaceId &&
    postWorkspaceId !== user.workspace_id
  ) {
    return false;
  }
  if (user.role === "admin") return true;
  if (!houseId) return true;
  if (user.role === "manager") return canAccessHouse(user, houseId);
  const adminClient = createAdminClient();
  const { data: resident } = await adminClient
    .from("residents")
    .select("house_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return resident?.house_id === houseId;
}

const createPostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(1, "Content is required").max(5000),
});

export async function createBulletinPost(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();

  const parsed = createPostSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const houseIds = formData.getAll("house_ids") as string[];
  const photoUrl = (formData.get("photo_url") as string) || null;

  const adminClient = createAdminClient();

  // Authorize house_ids: verify the user can post to each requested house
  if (houseIds.length > 0) {
    if (user.role === "resident") {
      const { data: myResident } = await adminClient
        .from("residents")
        .select("house_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      const myHouseId = myResident?.house_id as string | null;
      for (const hid of houseIds) {
        if (hid !== myHouseId) return { error: "You can only post to your own house" };
      }
    } else if (user.role === "manager") {
      for (const hid of houseIds) {
        if (!user.assigned_house_ids.includes(hid)) {
          return { error: "You can only post to your assigned houses" };
        }
      }
    }
    // admin can post to any house
  }

  // Build rows for batch insert
  const targets: (string | null)[] = houseIds.length > 0 ? houseIds : [null];
  const rows = targets.map((houseId) => ({
    author_id: user.id,
    workspace_id: user.workspace_id,
    title: parsed.data.title,
    content: parsed.data.content,
    house_id: houseId,
    photo_url: photoUrl,
  }));

  const { data: inserted, error } = await adminClient
    .from("bulletin_posts")
    .insert(rows)
    .select("id");

  if (error) return { error: error.message };

  for (const row of inserted ?? []) {
    await logActivity({
      actorId: user.id,
      eventType: "bulletin_post_created",
      entityType: "bulletin",
      entityId: row.id,
      description: `${user.full_name} posted "${parsed.data.title}" to the bulletin board`,
    });
  }

  // Schedule push notifications after the response so they don't
  // block the action and the serverless runtime stays alive.
  const pushTargets = targets.filter((h): h is string => h !== null);
  if (pushTargets.length > 0) {
    const postTitle = parsed.data.title;
    const postContent = parsed.data.content;
    const authorId = user.id;
    const authorName = user.full_name;
    after(async () => {
      try {
        const pushAdmin = createAdminClient();
        for (const houseId of pushTargets) {
          const { data: residents } = await pushAdmin
            .from("residents")
            .select("user_id")
            .eq("house_id", houseId)
            .eq("status", "active")
            .not("user_id", "is", null);

          const userIds = (residents ?? [])
            .map((r) => r.user_id as string)
            .filter((uid) => uid !== authorId);

          if (userIds.length > 0) {
            const bodyText =
              postContent && postContent !== postTitle
                ? `${postTitle}\n${postContent.slice(0, 150)}`
                : postTitle;
            await sendWebPushToMany(userIds, "bulletin_post", {
              title: `Community Notice from ${authorName}`,
              body: bodyText,
              url: "/bulletin",
            });
          }
        }
      } catch (err) {
        console.error("[push] bulletin push failed:", err);
      }
    });
  }

  revalidatePath("/bulletin");
  return {};
}

export async function deleteBulletinPost(postId: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Verify ownership, admin anywhere, or manager within their assigned
  // house. Managers can delete posts in houses they manage (including
  // posts by residents / other staff) but NOT posts outside their
  // assigned houses.
  const { data: post } = await adminClient
    .from("bulletin_posts")
    .select("id, author_id, title, house_id, workspace_id")
    .eq("id", postId)
    .maybeSingle();

  if (!post) return { error: "Post not found" };
  // Workspace boundary: never let a user act on another workspace's post.
  const postWorkspaceId = (post.workspace_id as string | null) ?? null;
  if (user.workspace_id && postWorkspaceId && postWorkspaceId !== user.workspace_id) {
    return { error: "Not authorized" };
  }
  const isAuthor = post.author_id === user.id;
  const isAdmin = user.role === "admin";
  const postHouseId = (post.house_id as string | null) ?? null;
  const isManagerForHouse =
    user.role === "manager" &&
    postHouseId !== null &&
    canAccessHouse(user, postHouseId);
  if (!isAuthor && !isAdmin && !isManagerForHouse) {
    return { error: "Not authorized" };
  }

  const { error } = await adminClient
    .from("bulletin_posts")
    .delete()
    .eq("id", postId);

  if (error) return { error: error.message };

  await logActivity({
    actorId: user.id,
    eventType: "bulletin_post_deleted",
    entityType: "bulletin",
    entityId: postId,
    description: `${user.full_name} deleted bulletin post "${post.title}"`,
  });

  revalidatePath("/bulletin");
  return {};
}

export async function togglePinPost(postId: string) {
  const user = await requireRole("admin", "manager");
  const adminClient = createAdminClient();

  const { data: post } = await adminClient
    .from("bulletin_posts")
    .select("id, is_pinned, title, house_id, workspace_id")
    .eq("id", postId)
    .maybeSingle();

  if (!post) return { error: "Post not found" };

  // Workspace boundary: never pin/unpin another workspace's post.
  const postWorkspaceId = (post.workspace_id as string | null) ?? null;
  if (user.workspace_id && postWorkspaceId && postWorkspaceId !== user.workspace_id) {
    return { error: "Not authorized" };
  }

  // Managers can only pin/unpin within their assigned houses. Admin
  // can pin any post (including null-house global posts).
  const postHouseId = (post.house_id as string | null) ?? null;
  if (user.role === "manager") {
    if (!postHouseId || !canAccessHouse(user, postHouseId)) {
      return { error: "Not authorized" };
    }
  }

  const newPinned = !post.is_pinned;

  const { error } = await adminClient
    .from("bulletin_posts")
    .update({ is_pinned: newPinned, updated_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) return { error: error.message };

  await logActivity({
    actorId: user.id,
    eventType: newPinned ? "bulletin_post_pinned" : "bulletin_post_unpinned",
    entityType: "bulletin",
    entityId: postId,
    description: `${user.full_name} ${newPinned ? "pinned" : "unpinned"} "${post.title}"`,
  });

  revalidatePath("/bulletin");
  return {};
}

// ─── Likes ──────────────────────────────────────────────────

export async function toggleLike(postId: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Only allow liking a post the user can actually see (also enforces
  // the workspace boundary so a post can't be liked across workspaces).
  const { data: post } = await adminClient
    .from("bulletin_posts")
    .select("id, house_id, workspace_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { error: "Post not found" };
  const canSee = await canSeeBulletinHouse(
    user,
    (post.house_id as string | null) ?? null,
    (post.workspace_id as string | null) ?? null
  );
  if (!canSee) return { error: "Not authorized" };

  const { data: existing } = await adminClient
    .from("bulletin_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await adminClient.from("bulletin_likes").delete().eq("id", existing.id);
  } else {
    await adminClient.from("bulletin_likes").insert({
      post_id: postId,
      user_id: user.id,
    });
  }

  revalidatePath("/bulletin");
  return {};
}

// ─── Comments ───────────────────────────────────────────────

export async function addComment(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const user = await requireAuth();
  const postId = formData.get("post_id") as string;
  const content = (formData.get("content") as string)?.trim();

  if (!postId || !content) return { error: "Comment cannot be empty" };
  if (content.length > 2000) return { error: "Comment too long (max 2000 chars)" };

  const adminClient = createAdminClient();

  // Verify the post exists AND is visible to this user before
  // accepting a comment. Without this a resident could comment on a
  // post in another house by guessing the UUID.
  const { data: post } = await adminClient
    .from("bulletin_posts")
    .select("id, house_id, workspace_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { error: "Post not found" };
  const canSee = await canSeeBulletinHouse(
    user,
    (post.house_id as string | null) ?? null,
    (post.workspace_id as string | null) ?? null
  );
  if (!canSee) return { error: "Not authorized" };

  const { error } = await adminClient.from("bulletin_comments").insert({
    post_id: postId,
    user_id: user.id,
    content,
  });

  if (error) return { error: error.message };

  revalidatePath("/bulletin");
  return {};
}

export async function deleteComment(commentId: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Join to bulletin_posts so we can scope managers to their
  // assigned houses. Any user can delete their own comments; admin
  // can delete any; manager only within their assigned houses.
  const { data: comment } = await adminClient
    .from("bulletin_comments")
    .select("id, user_id, post:bulletin_posts(house_id, workspace_id)")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) return { error: "Comment not found" };
  const postRow =
    (comment.post as unknown as {
      house_id: string | null;
      workspace_id: string | null;
    } | null) ?? null;
  // Workspace boundary: never delete a comment on another workspace's post.
  const postWorkspaceId = postRow?.workspace_id ?? null;
  if (user.workspace_id && postWorkspaceId && postWorkspaceId !== user.workspace_id) {
    return { error: "Not authorized" };
  }
  const isAuthor = comment.user_id === user.id;
  const isAdmin = user.role === "admin";
  const postHouseId = postRow?.house_id ?? null;
  const isManagerForHouse =
    user.role === "manager" &&
    postHouseId !== null &&
    canAccessHouse(user, postHouseId);
  if (!isAuthor && !isAdmin && !isManagerForHouse) {
    return { error: "Not authorized" };
  }

  await adminClient.from("bulletin_comments").delete().eq("id", commentId);

  revalidatePath("/bulletin");
  return {};
}

// ─── Photo Upload ───────────────────────────────────────────

export async function uploadBulletinPhoto(formData: FormData) {
  await requireAuth();
  const file = formData.get("file") as File;
  if (!file || file.size === 0) return { error: "No file provided", url: null };

  if (file.size > 5 * 1024 * 1024) return { error: "File too large (max 5MB)", url: null };

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) return { error: "Only image files are allowed", url: null };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const allowedExts = ["jpg", "jpeg", "png", "gif", "webp"];
  if (!allowedExts.includes(ext)) return { error: "Invalid file extension", url: null };

  const adminClient = createAdminClient();
  const path = `bulletin/${Date.now()}.${ext}`;

  const { error } = await adminClient.storage
    .from("uploads")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { error: error.message, url: null };

  const { data: urlData } = adminClient.storage.from("uploads").getPublicUrl(path);

  return { url: urlData.publicUrl };
}

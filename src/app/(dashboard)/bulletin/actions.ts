"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { z } from "zod";

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

  // Create one post per selected house; if no houses selected, create a single global post
  const targets = houseIds.length > 0 ? houseIds : [null];
  for (const houseId of targets) {
    const { data, error } = await adminClient.from("bulletin_posts").insert({
      author_id: user.id,
      title: parsed.data.title,
      content: parsed.data.content,
      house_id: houseId,
      photo_url: photoUrl,
    }).select("id").single();

    if (error) return { error: error.message };

    await logActivity({
      actorId: user.id,
      eventType: "bulletin_post_created",
      entityType: "bulletin",
      entityId: data.id,
      description: `${user.full_name} posted "${parsed.data.title}" to the bulletin board`,
    });
  }

  revalidatePath("/bulletin");
  return {};
}

export async function deleteBulletinPost(postId: string) {
  const user = await requireAuth();
  const adminClient = createAdminClient();

  // Verify ownership or admin
  const { data: post } = await adminClient
    .from("bulletin_posts")
    .select("id, author_id, title")
    .eq("id", postId)
    .single();

  if (!post) return { error: "Post not found" };
  if (post.author_id !== user.id && user.role !== "admin" && user.role !== "manager") {
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
    .select("id, is_pinned, title")
    .eq("id", postId)
    .single();

  if (!post) return { error: "Post not found" };

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

  const { data: comment } = await adminClient
    .from("bulletin_comments")
    .select("id, user_id")
    .eq("id", commentId)
    .single();

  if (!comment) return { error: "Comment not found" };
  if (comment.user_id !== user.id && user.role !== "admin" && user.role !== "manager") {
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

  const adminClient = createAdminClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `bulletin/${Date.now()}.${ext}`;

  const { error } = await adminClient.storage
    .from("uploads")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { error: error.message, url: null };

  const { data: urlData } = adminClient.storage.from("uploads").getPublicUrl(path);

  return { url: urlData.publicUrl };
}

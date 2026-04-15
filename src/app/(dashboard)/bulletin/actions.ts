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

  const adminClient = createAdminClient();

  const { data, error } = await adminClient.from("bulletin_posts").insert({
    author_id: user.id,
    title: parsed.data.title,
    content: parsed.data.content,
  }).select("id").single();

  if (error) return { error: error.message };

  await logActivity({
    actorId: user.id,
    eventType: "bulletin_post_created",
    entityType: "bulletin",
    entityId: data.id,
    description: `${user.full_name} posted "${parsed.data.title}" to the bulletin board`,
  });

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

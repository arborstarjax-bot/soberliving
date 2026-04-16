"use client";

import { useState, useTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pin,
  Heart,
  MessageCircle,
  Trash2,
  Send,
  MoreVertical,
  PinOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  toggleLike,
  addComment,
  deleteComment,
  deleteBulletinPost,
  togglePinPost,
} from "./actions";
import type { UserRole } from "@/lib/types";

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_role: string;
}

interface Post {
  id: string;
  author_id: string;
  title: string;
  content: string;
  photo_urls: string[];
  is_pinned: boolean;
  created_at: string;
  author_name: string;
  author_role: string;
  house_name: string | null;
  like_count: number;
  user_liked: boolean;
  comments: Comment[];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-blue-600",
    "bg-emerald-600",
    "bg-violet-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-cyan-600",
    "bg-indigo-600",
    "bg-teal-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    admin: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Admin" },
    manager: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Manager" },
    resident: { bg: "bg-gray-50 border-gray-200", text: "text-gray-600", label: "Resident" },
  };
  const c = config[role] ?? config.resident;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const sizeClasses = size === "sm" ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-sm";
  return (
    <div className={`${sizeClasses} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}>
      {getInitials(name)}
    </div>
  );
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function CommentSection({
  postId,
  comments,
  currentUserId,
  currentUserRole,
}: {
  postId: string;
  comments: Comment[];
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const [showComments, setShowComments] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [, commentAction, isCommenting] = useActionState(
    async (prev: { error?: string } | undefined, formData: FormData) => {
      const result = await addComment(prev, formData);
      return result;
    },
    undefined
  );

  const isStaff = currentUserRole === "admin" || currentUserRole === "manager";

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        <span className="font-medium">
          {comments.length > 0 ? `${comments.length} Comment${comments.length !== 1 ? "s" : ""}` : "Comment"}
        </span>
      </button>

      {showComments && (
        <div className="mt-4 space-y-3 border-t pt-4">
          {comments.map((c) => (
            <div key={c.id} className="group/comment flex items-start gap-2.5">
              <UserAvatar name={c.author_name} size="sm" />
              <div className="flex-1 min-w-0 bg-muted/40 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{c.author_name}</span>
                  <RoleBadge role={c.author_role} />
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(c.created_at)}
                  </span>
                </div>
                <p className="text-sm mt-0.5 text-foreground/90">{c.content}</p>
              </div>
              {(c.user_id === currentUserId || isStaff) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover/comment:opacity-100 transition-opacity"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => {
                      deleteComment(c.id);
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}

          <form action={commentAction} className="flex gap-2 mt-3 items-center">
            <input type="hidden" name="post_id" value={postId} />
            <Input
              name="content"
              placeholder="Write a comment..."
              className="h-9 text-sm rounded-full bg-muted/50 border-0 focus-visible:ring-1"
              maxLength={2000}
              required
              disabled={isCommenting}
            />
            <Button
              type="submit"
              size="sm"
              className="h-9 w-9 rounded-full p-0 shrink-0"
              disabled={isCommenting}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

export function BulletinFeed({
  posts,
  currentUserId,
  currentUserRole,
}: {
  posts: Post[];
  currentUserId: string;
  currentUserRole: UserRole;
}) {
  const [isPending, startTransition] = useTransition();
  const isStaff = currentUserRole === "admin" || currentUserRole === "manager";

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm p-12 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <MessageCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No posts yet</h3>
        <p className="text-muted-foreground text-sm">
          Be the first to share something with the community!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <article
          key={post.id}
          className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
            post.is_pinned ? "border-primary/40 ring-1 ring-primary/20" : ""
          }`}
        >
          {/* Pinned indicator bar */}
          {post.is_pinned && (
            <div className="bg-primary/10 px-5 py-1.5 flex items-center gap-1.5 border-b border-primary/20">
              <Pin className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">Pinned Post</span>
            </div>
          )}

          <div className="p-5">
            {/* Header: Avatar + Author + Role + Time + Menu */}
            <div className="flex items-start gap-3">
              <UserAvatar name={post.author_name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground">
                    {post.author_name}
                  </span>
                  <RoleBadge role={post.author_role} />
                  {post.house_name && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-amber-700">
                      {post.house_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {timeAgo(post.created_at)}
                </p>
              </div>
              {(isStaff || post.author_id === currentUserId) && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isStaff && (
                      <DropdownMenuItem
                        disabled={isPending}
                        onClick={() =>
                          startTransition(() => {
                            togglePinPost(post.id);
                          })
                        }
                      >
                        {post.is_pinned ? (
                          <>
                            <PinOff className="mr-2 h-4 w-4" />
                            Unpin
                          </>
                        ) : (
                          <>
                            <Pin className="mr-2 h-4 w-4" />
                            Pin to Top
                          </>
                        )}
                      </DropdownMenuItem>
                    )}
                    {(post.author_id === currentUserId || isStaff) && (
                      <DropdownMenuItem
                        disabled={isPending}
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("Delete this post? This cannot be undone.")) {
                            startTransition(() => {
                              deleteBulletinPost(post.id);
                            });
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Title */}
            <h3 className="text-base font-semibold mt-3 text-foreground">
              {post.title}
            </h3>

            {/* Content */}
            <p className="text-sm text-foreground/80 whitespace-pre-wrap mt-1.5 leading-relaxed">
              {post.content}
            </p>

            {/* Photos */}
            {post.photo_urls.length > 0 && (
              <div className={`mt-3 ${post.photo_urls.length === 1 ? "" : "grid gap-2 grid-cols-2"}`}>
                {post.photo_urls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt={`Photo ${i + 1}`}
                    className={`rounded-xl shadow-md object-cover ${
                      post.photo_urls.length === 1 ? "max-h-80" : "w-full h-48"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Action bar: Likes + Comments */}
            <div className="flex items-center gap-1 mt-4 pt-3 border-t">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(() => {
                    toggleLike(post.id);
                  })
                }
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  post.user_liked
                    ? "text-red-500 bg-red-50 hover:bg-red-100"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Heart
                  className={`h-4 w-4 ${post.user_liked ? "fill-current" : ""}`}
                />
                {post.like_count > 0 ? (
                  <span>{post.like_count}</span>
                ) : (
                  <span>Like</span>
                )}
              </button>

              <div className="rounded-full px-3 py-1.5">
                <CommentSection
                  postId={post.id}
                  comments={post.comments}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

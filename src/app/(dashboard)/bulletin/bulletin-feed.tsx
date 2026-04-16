"use client";

import { useState, useTransition, useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Image as ImageIcon,
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
  photo_url: string | null;
  is_pinned: boolean;
  created_at: string;
  author_name: string;
  author_role: string;
  house_name: string | null;
  like_count: number;
  user_liked: boolean;
  comments: Comment[];
}

function RoleBadge({ role }: { role: string }) {
  const variants: Record<string, string> = {
    admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    resident: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${variants[role] ?? variants.resident}`}>
      {label}
    </span>
  );
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
    <div>
      <button
        type="button"
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? "s" : ""}` : "Comment"}
      </button>

      {showComments && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{c.author_name}</span>
                <RoleBadge role={c.author_role} />
                <span className="text-muted-foreground ml-1 text-xs">
                  {new Date(c.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <p className="text-sm mt-0.5">{c.content}</p>
              </div>
              {(c.user_id === currentUserId || isStaff) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => {
                      deleteComment(c.id);
                    })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}

          <form action={commentAction} className="flex gap-2 mt-2">
            <input type="hidden" name="post_id" value={postId} />
            <Input
              name="content"
              placeholder="Write a comment..."
              className="h-8 text-sm"
              maxLength={2000}
              required
              disabled={isCommenting}
            />
            <Button type="submit" size="sm" className="h-8 px-2" disabled={isCommenting}>
              <Send className="h-3.5 w-3.5" />
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
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No posts yet. Be the first to share something!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <Card
          key={post.id}
          className={post.is_pinned ? "border-primary/50 bg-primary/5" : ""}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {post.is_pinned && (
                  <Pin className="h-4 w-4 text-primary shrink-0" />
                )}
                <CardTitle className="text-base truncate">
                  {post.title}
                </CardTitle>
                {post.is_pinned && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    Pinned
                  </Badge>
                )}
                {post.house_name && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {post.house_name}
                  </Badge>
                )}
              </div>
              {(isStaff || post.author_id === currentUserId) && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{post.author_name}</span>
              <RoleBadge role={post.author_role} />
              <span>•</span>
              <span>
                {new Date(post.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{post.content}</p>

            {post.photo_url && (
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.photo_url}
                  alt="Post attachment"
                  className="max-h-80 rounded-lg object-cover"
                />
              </div>
            )}

            <div className="flex items-center gap-4 pt-1">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(() => {
                    toggleLike(post.id);
                  })
                }
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  post.user_liked
                    ? "text-red-500"
                    : "text-muted-foreground hover:text-red-500"
                }`}
              >
                <Heart
                  className={`h-3.5 w-3.5 ${post.user_liked ? "fill-current" : ""}`}
                />
                {post.like_count > 0 && post.like_count}
              </button>

              <CommentSection
                postId={post.id}
                comments={post.comments}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

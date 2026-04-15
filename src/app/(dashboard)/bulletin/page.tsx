import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pin } from "lucide-react";
import { BulletinActions } from "./bulletin-actions";
import { NewPostForm } from "./new-post-form";

export default async function BulletinPage() {
  const user = await requireAuth();
  const supabase = createAdminClient();

  const { data: posts } = await supabase
    .from("bulletin_posts")
    .select("*, author:users!author_id(full_name)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bulletin Board</h1>
          <p className="text-muted-foreground">
            Announcements and messages for all residents and staff
          </p>
        </div>
      </div>

      <NewPostForm />

      <div className="space-y-4">
        {(posts ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No posts yet. Be the first to share something!
              </p>
            </CardContent>
          </Card>
        ) : (
          (posts ?? []).map((post) => {
            const authorName = Array.isArray(post.author)
              ? (post.author as Array<{ full_name: string }>)[0]?.full_name
              : (post.author as { full_name: string } | null)?.full_name;

            return (
              <Card
                key={post.id}
                className={post.is_pinned ? "border-primary/50 bg-primary/5" : ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
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
                    </div>
                    <BulletinActions
                      postId={post.id}
                      authorId={post.author_id}
                      isPinned={post.is_pinned}
                      currentUserId={user.id}
                      currentUserRole={user.role}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {authorName ?? "Unknown"} •{" "}
                    {new Date(post.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

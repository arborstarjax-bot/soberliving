import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { CursorPager } from "@/components/cursor-pager";
import {
  DEFAULT_PAGE_SIZE,
  applyCursor,
  buildCursorHref,
  encodeCursor,
  parseCursor,
  type Cursor,
} from "@/lib/cursor";
import { UserActions } from "./user-actions";

interface UsersListSectionProps {
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Users list — heavy join of `users + user_roles + manager_house_assignments`
 * plus a tiny parallel fetch of active houses (for the UserActions menu).
 * Lives behind a `<Suspense>` boundary on `page.tsx` so the header
 * and Create button paint immediately.
 *
 * Pagination: cursor keyed on `(full_name, id)` — alphabetical,
 * stable. The common admin lookup ("find Jane Doe") works
 * naturally with alphabetical order.
 */
export async function UsersListSection({ searchParams }: UsersListSectionProps) {
  const supabase = await createClient();
  const cursor = parseCursor(searchParams.c);

  let query = supabase
    .from("users")
    .select(
      "id, email, full_name, is_active, user_roles(role), manager_house_assignments(house_id, houses(name), unassigned_at)"
    )
    .order("full_name", { ascending: true })
    .order("id", { ascending: true })
    .limit(DEFAULT_PAGE_SIZE + 1);

  query = applyCursor(query, cursor, {
    tsColumn: "full_name",
    idColumn: "id",
    direction: "asc",
  });

  const [{ data: rawUsers, error }, { data: houses }] = await Promise.all([
    query,
    supabase
      .from("houses")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">
        Failed to load users: {error.message}
      </div>
    );
  }

  type UserRow = {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    user_roles: Array<{ role: string }> | null;
    manager_house_assignments: Array<{
      house_id: string;
      houses: { name: string } | null;
      unassigned_at: string | null;
    }> | null;
  };
  const all = (rawUsers ?? []) as unknown as UserRow[];
  const hasNext = all.length > DEFAULT_PAGE_SIZE;
  const users = hasNext ? all.slice(0, DEFAULT_PAGE_SIZE) : all;
  const nextCursor: Cursor | null = hasNext
    ? {
        ts: users[users.length - 1].full_name,
        id: users[users.length - 1].id,
      }
    : null;

  // cp= back-stack — same contract as bulletin / houses cursor
  // pagers. We stash the encoded cursors we've visited so Prev can
  // pop the stack and route back to the exact same page.
  const cpRaw = Array.isArray(searchParams.cp)
    ? searchParams.cp[0]
    : searchParams.cp;
  const cpList: string[] = cpRaw ? cpRaw.split(",").filter(Boolean) : [];

  const prevHref: string | null = cursor
    ? (() => {
        if (cpList.length === 0) {
          // Page 2 → page 1: drop c + cp.
          return buildCursorHref(
            "/users",
            { ...searchParams, cp: undefined, c: undefined },
            null
          );
        }
        const newCp = cpList.slice(0, -1);
        const prevEnc = cpList[cpList.length - 1];
        return buildCursorHref(
          "/users",
          { ...searchParams, cp: newCp.length ? newCp.join(",") : undefined },
          parseCursor(prevEnc)
        );
      })()
    : null;

  const nextHref: string | null = nextCursor
    ? buildCursorHref(
        "/users",
        {
          ...searchParams,
          cp: (cursor ? [...cpList, encodeCursor(cursor)] : cpList).join(","),
        },
        nextCursor
      )
    : null;

  return (
    <>
      <div className="space-y-2">
        {users.map((u) => {
          const roleRecord = u.user_roles?.[0];
          const role = roleRecord?.role ?? "resident";
          const activeAssignments = (u.manager_house_assignments ?? []).filter(
            (a) => !a.unassigned_at
          );
          return (
            <Link key={u.id} href={`/users/${u.id}`}>
              <Card
                className={`hover:bg-muted/50 transition-colors ${
                  !u.is_active ? "opacity-50" : ""
                }`}
              >
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.full_name}</span>
                      <Badge
                        variant={
                          role === "admin"
                            ? "default"
                            : role === "manager"
                              ? "secondary"
                              : "outline"
                        }
                        className="capitalize"
                      >
                        {role}
                      </Badge>
                      {!u.is_active && (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {role === "manager" && activeAssignments.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Houses:{" "}
                        {activeAssignments
                          .map((a) => a.houses?.name)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  {u.is_active && (
                    <UserActions
                      userId={u.id}
                      currentRole={role}
                      houses={houses ?? []}
                      assignedHouseIds={activeAssignments.map(
                        (a) => a.house_id
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {users.length === 0 && (
          <p className="text-sm text-muted-foreground">No users found.</p>
        )}
      </div>

      <CursorPager prevHref={prevHref} nextHref={nextHref} itemLabel="users" />
    </>
  );
}

import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui/skeleton";
import { CreateUserDialog } from "./create-user-dialog";
import { UsersListSection } from "./users-list-section";

/**
 * Users & Roles shell. Title and Create button render immediately.
 * The joined user list (roles + manager assignments + houses) is
 * deferred behind `<Suspense>` so the page shell paints without
 * waiting on the join.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users & Roles</h1>
          <p className="text-muted-foreground">
            Manage staff and resident accounts. Click a user to edit their
            profile.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <Suspense fallback={<ListSkeleton rows={8} rowClassName="h-16 w-full" />}>
        <UsersListSection searchParams={sp} />
      </Suspense>
    </div>
  );
}

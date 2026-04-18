import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Bare full-screen layout for /acknowledge/[id] — mirrors
 * (commitment)/layout.tsx so a resident can see and sign a blocker
 * without the sidebar/chrome. Non-residents bouncing here are sent
 * back to /admin.
 *
 * We intentionally do NOT re-run the blocker gate here — that's the
 * job of (dashboard)/layout.tsx. Once the resident lands on this
 * route we want them to stay here until the blocker is signed, so
 * any redirect logic belongs on the target side, not on the gate.
 */
export default async function BlockerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  if (user.role !== "resident") {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 lg:p-6 max-w-4xl">
        {children}
      </div>
    </div>
  );
}

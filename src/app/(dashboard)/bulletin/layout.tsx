import { requireAuth } from "@/lib/auth";
import { BulletinTabs } from "./bulletin-tabs";

/**
 * Shared chrome for /bulletin (posts) and /bulletin/blockers (admin
 * management of acknowledgment-required messages). Title + tabs live
 * at the layout level so navigation between the two tabs doesn't
 * flicker them in and out.
 */
export default async function BulletinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community Services</h1>
        <p className="text-muted-foreground">
          Announcements, ride shares, acknowledgments, and reports
        </p>
      </div>
      <BulletinTabs userRole={user.role} />
      {children}
    </div>
  );
}

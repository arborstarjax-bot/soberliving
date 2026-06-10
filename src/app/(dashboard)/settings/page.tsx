import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRoleLabel } from "@/lib/permissions";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { PushNotificationCard } from "./push-notification-card";

export default async function SettingsPage() {
  const user = await requireAuth();

  // Fetch push preferences for the PushNotificationCard.
  const admin = createAdminClient();
  const { data: pushPrefs } = await admin
    .from("users")
    .select("push_chores, push_bulletin, push_discipline")
    .eq("id", user.id)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Account settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Role</p>
              <p className="font-medium">{getRoleLabel(user.role)}</p>
            </div>
          </div>
          <div className="border-t pt-4">
            <ProfileForm initialName={user.full_name} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <PushNotificationCard
        initialPrefs={{
          push_chores: pushPrefs?.push_chores ?? true,
          push_bulletin: pushPrefs?.push_bulletin ?? true,
          push_discipline: pushPrefs?.push_discipline ?? true,
        }}
      />
    </div>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — HouseFlow",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 py-12 text-sm leading-6">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: November 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What we collect</h2>
        <p>
          HouseFlow is a management platform for sober-living homes. The
          workspace that invites you (the house operator) controls your data.
          Depending on how your workspace uses the app we may store: name,
          email, phone number, house/room/bed assignment, rent and payment
          records, chore sign-offs, meeting logs, leave requests and passes,
          discipline records, intake documents, check-in responses, urinalysis
          results, and photos you or staff upload (chores, documents, UA
          results).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How it&apos;s used</h2>
        <p>
          Data is used only to run the workspace: housing management,
          accountability (chores, meetings, curfews, UAs), payments, and
          communication between you and house staff. We do not sell data, show
          ads, or track you across other apps or sites.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Who can see it</h2>
        <p>
          Staff and admins of your workspace can see resident records.
          Residents of a workspace can see community content (bulletin posts,
          shared chore and meeting views) but not other residents&apos;
          private records. We (the platform operator) access data only to run,
          secure, and support the service. Service providers: Supabase
          (database, file storage) and Vercel (hosting), Resend (email),
          Stripe (workspace billing — card details never touch our servers).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Retention &amp; deletion</h2>
        <p>
          You can delete your account at any time: Settings → Delete Account
          removes your login and scrubs your personal details. Workspace
          admins can delete an entire workspace (Settings → Workspace →
          General → Delete Workspace), which removes all of its houses,
          residents, records, and files. You can also request deletion at{" "}
          <a href="/delete-account" className="underline">
            /delete-account
          </a>
          . Operational records your workspace must keep (e.g. payment
          history) are anonymized rather than erased. Backups roll off within
          30 days.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Security</h2>
        <p>
          Data is encrypted in transit (TLS) and at rest. Access is enforced
          by row-level security: each workspace sees only its own data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          Questions or deletion requests: contact your workspace
          administrator, or email the platform operator.
        </p>
      </section>
    </main>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — HouseFlow",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 py-12 text-sm leading-6">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: November 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">The service</h2>
        <p>
          HouseFlow provides sober-living home management tools — resident
          records, chores, meetings, passes, payments, check-ins, and
          communication — to house operators (&quot;workspaces&quot;) and the
          residents and staff they invite.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your workspace controls your data</h2>
        <p>
          Workspace operators are the data controllers for their residents&apos;
          records. The operator decides what to collect, who has access, and
          how long records are kept. We process that data only to provide the
          service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Acceptable use</h2>
        <p>
          Don&apos;t post unlawful, abusive, or misleading content; don&apos;t
          upload content you have no right to share; don&apos;t probe or
          attack the service. Community posts can be reported to workspace
          admins and removed.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Subscriptions</h2>
        <p>
          Workspaces subscribe to a plan (Solo, House, or Org) that sets
          house limits. Trials convert to paid subscriptions unless canceled.
          You can manage or cancel billing anytime in Workspace Settings →
          Billing.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Not a treatment provider</h2>
        <p>
          HouseFlow is record-keeping software. It is not medical advice,
          treatment, or an emergency service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Liability</h2>
        <p>
          The service is provided &quot;as is.&quot; To the maximum extent
          permitted by law, the platform operator is not liable for indirect
          or consequential damages.
        </p>
      </section>
    </main>
  );
}

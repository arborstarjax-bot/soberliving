import Link from "next/link";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: April 2026</p>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">1. Acceptance of Terms</h2>
        <p>
          By accessing or using HouseFlow (&ldquo;the Service&rdquo;), you agree to be bound by
          these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2 className="text-lg font-semibold">2. Description of Service</h2>
        <p>
          HouseFlow is a web-based platform for managing sober living and transitional
          housing operations, including resident intake, housing assignments, chore
          scheduling, payments, and communication.
        </p>

        <h2 className="text-lg font-semibold">3. User Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account
          credentials. You agree to notify us immediately of any unauthorized use of
          your account.
        </p>

        <h2 className="text-lg font-semibold">4. Acceptable Use</h2>
        <p>
          You agree not to use the Service for any unlawful purpose or in any way that
          could damage, disable, or impair the Service. You agree not to attempt to gain
          unauthorized access to any part of the Service.
        </p>

        <h2 className="text-lg font-semibold">5. Data and Privacy</h2>
        <p>
          Your use of the Service is also governed by our{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          . By using the Service, you consent to the collection and use of information
          as described therein.
        </p>

        <h2 className="text-lg font-semibold">6. Workspace Administrators</h2>
        <p>
          Workspace administrators are responsible for managing their organization&apos;s
          data within the Service. Administrators control user access, workspace
          settings, and resident information within their workspace.
        </p>

        <h2 className="text-lg font-semibold">7. Payment Processing</h2>
        <p>
          Payment features within the Service facilitate record-keeping between
          workspace administrators and residents. HouseFlow is not a payment processor
          and does not handle financial transactions directly.
        </p>

        <h2 className="text-lg font-semibold">8. Limitation of Liability</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind.
          HouseFlow shall not be liable for any indirect, incidental, or consequential
          damages arising from your use of the Service.
        </p>

        <h2 className="text-lg font-semibold">9. Termination</h2>
        <p>
          We may terminate or suspend your access to the Service at any time, with or
          without cause. Upon termination, your right to use the Service ceases
          immediately.
        </p>

        <h2 className="text-lg font-semibold">10. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. Continued use of the
          Service after changes constitutes acceptance of the new Terms.
        </p>
      </section>

      <div className="border-t pt-4">
        <Link href="/login" className="text-sm text-primary hover:underline">
          &larr; Back to login
        </Link>
      </div>
    </div>
  );
}

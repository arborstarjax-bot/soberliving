import Link from "next/link";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: April 2026</p>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">1. Information We Collect</h2>
        <p>
          We collect information you provide when creating an account (name, email,
          password) and information entered during the intake and onboarding process
          (contact details, emergency contacts, employment information).
        </p>

        <h2 className="text-lg font-semibold">2. How We Use Your Information</h2>
        <p>
          Your information is used to provide and improve the Service, including
          managing housing operations, facilitating communication between staff and
          residents, and generating required documentation.
        </p>

        <h2 className="text-lg font-semibold">3. Data Storage and Security</h2>
        <p>
          Your data is stored securely using industry-standard encryption. We use
          Supabase for data storage with row-level security policies to ensure
          workspace data isolation. Passwords are hashed and never stored in plain text.
        </p>

        <h2 className="text-lg font-semibold">4. Workspace Data Isolation</h2>
        <p>
          Each workspace&apos;s data is logically separated. Workspace administrators
          can only access data within their own workspace. No cross-workspace data
          sharing occurs without explicit authorization.
        </p>

        <h2 className="text-lg font-semibold">5. Third-Party Services</h2>
        <p>
          We use the following third-party services to operate the platform:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Supabase — database and authentication</li>
          <li>Vercel — hosting and deployment</li>
          <li>Resend — transactional email delivery</li>
        </ul>

        <h2 className="text-lg font-semibold">6. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active or as needed to
          provide the Service. You may request deletion of your data by contacting your
          workspace administrator.
        </p>

        <h2 className="text-lg font-semibold">7. Your Rights</h2>
        <p>
          You have the right to access, correct, or delete your personal information.
          Contact your workspace administrator to exercise these rights.
        </p>

        <h2 className="text-lg font-semibold">8. Cookies and Tracking</h2>
        <p>
          We use essential cookies for authentication and session management. We do not
          use third-party tracking or advertising cookies.
        </p>

        <h2 className="text-lg font-semibold">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify users of
          material changes through the Service.
        </p>

        <h2 className="text-lg font-semibold">10. Contact</h2>
        <p>
          If you have questions about this Privacy Policy, please contact the platform
          administrator.
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

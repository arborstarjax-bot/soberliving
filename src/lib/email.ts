import { Resend } from "resend";

// Lazy init: don't construct Resend at module load. If RESEND_API_KEY is
// missing in the environment (e.g. preview/dev), the old `new Resend(undefined)`
// pattern crashed with "Missing API key" the moment any server action that
// imports this module was invoked — blowing up POSTs across the app even
// though the action itself didn't need email.
//
// With this lazy pattern, modules import fine without a key. If a code path
// actually tries to SEND an email without a key, we log a loud warning and
// return gracefully so the calling server action still succeeds (action
// completes, user sees no error — just no email goes out). Ops gets a
// clear signal in the logs to set RESEND_API_KEY.
let _client: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

// Resend requires a verified domain. Use FROM_EMAIL for a verified
// sender, or fall back to Resend's default sandbox address.
const fromEmail =
  process.env.FROM_EMAIL ||
  process.env.RESEND_FROM_EMAIL ||
  "Sober Living <onboarding@resend.dev>";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendInviteEmail({
  to,
  fullName,
  role,
  inviteLink,
  appUrl,
}: {
  to: string;
  fullName: string;
  role: string;
  inviteLink: string;
  /**
   * Canonical app origin (e.g. https://soberliving.vercel.app). Passed
   * in rather than derived here so server actions can resolve it from
   * the incoming request headers — avoids hard-coded localhost
   * fallbacks in production emails.
   */
  appUrl?: string;
}) {
  const resend = getResend();
  if (!resend) {
    // Soft-fail so a missing key doesn't break the server action that
    // triggered the email. Ops sees the warning in Vercel logs.
    console.warn(
      "[email] RESEND_API_KEY not set — skipping sendInviteEmail to",
      to
    );
    return { error: null, id: null, skipped: true as const };
  }

  // Match getAppOrigin()'s priority (SITE_URL first) so the email
  // footer URL stays consistent with invite/redirect URLs generated
  // by the canonical helper.
  const resolvedAppUrl =
    appUrl ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const safeName = escapeHtml(fullName);
  const safeRole = escapeHtml(role);
  const safeLink = escapeHtml(inviteLink);
  const safeAppUrl = escapeHtml(resolvedAppUrl);

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject: "You've been invited to Sober Living",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color: #111; margin-bottom: 8px;">Welcome to Sober Living</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Hi ${safeName},
        </p>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          You've been invited as a <strong>${safeRole}</strong>. Click the button below to set your password and get started.
        </p>
        <div style="margin: 28px 0;">
          <a href="${safeLink}" style="display: inline-block; background: #111; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Set Your Password
          </a>
        </div>
        <p style="color: #999; font-size: 13px; line-height: 1.5;">
          This link expires in 24 hours. If it doesn't work, copy and paste this URL into your browser:
        </p>
        <p style="color: #999; font-size: 12px; word-break: break-all;">
          ${safeLink}
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #bbb; font-size: 12px;">
          Sober Living &mdash; <a href="${safeAppUrl}" style="color: #bbb;">${safeAppUrl}</a>
        </p>
      </div>
    `,
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null, id: data?.id };
}

"use server";
import { err, okVoid, type ActionResult } from "@/lib/action-result";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const bugReportSchema = z.object({
  category: z.enum(["bug", "help", "feedback"]),
  subject: z.string().min(3).max(200),
  details: z.string().min(10).max(5000),
});

// App-store support channel: every logged-in user can file a bug /
// help request / feedback. Delivered to the operator inbox via Resend.
const SUPPORT_INBOX = "arborstarjax@gmail.com";

export async function submitBugReport(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireAuth();

  const parsed = bugReportSchema.safeParse({
    category: formData.get("category"),
    subject: formData.get("subject"),
    details: formData.get("details"),
  });
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid report");
  }

  const { category, subject, details } = parsed.data;
  const label =
    category === "bug" ? "Bug report" : category === "help" ? "Help request" : "Feedback";

  const body = [
    `${label} — Sober Living app`,
    "",
    `From: ${user.full_name || "Unknown user"} <${user.email ?? "no-email"}>`,
    `User ID: ${user.id}`,
    `Role: ${user.role}`,
    `Page: ${(formData.get("page") as string) || "n/a"}`,
    "",
    `Subject: ${subject}`,
    "",
    details,
  ].join("\n");

  const result = await sendEmail({
    to: SUPPORT_INBOX,
    subject: `[Sober Living ${label}] ${subject}`,
    text: body,
  });
  if (result.error) return err(result.error);
  return okVoid();
}

import { createClient } from "@/lib/supabase/server";
import {
  getWorkspaceForUser,
  getWorkspace,
  getWorkspaceSettings,
} from "@/lib/workspace";
import { RulesPresentation } from "./rules-presentation";
import { RULES_SLIDES, type RulesSlide } from "./rules-content";

export default async function RulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = user ? await getWorkspaceForUser(user.id) : null;
  const [workspace, settings] = membership
    ? await Promise.all([
        getWorkspace(membership.workspace_id),
        getWorkspaceSettings(membership.workspace_id),
      ])
    : [null, null];
  const houseName = workspace?.name ?? "the house";

  const rulesText = settings?.rules_text?.trim();
  let slides: RulesSlide[];
  if (rulesText) {
    // Workspace-defined rules sheet: one rule per line.
    const lines = rulesText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    slides = [
      {
        title: "House Rules",
        note: `${houseName} — Please read each rule carefully. You will be asked to sign an acknowledgment at the end.`,
      },
    ];
    const CHUNK = 6;
    for (let i = 0; i < lines.length; i += CHUNK) {
      const part = lines.slice(i, i + CHUNK);
      slides.push({
        title:
          lines.length > CHUNK
            ? `House Rules (${i + 1}–${i + part.length})`
            : "House Rules",
        items: part.map((t, j) => ({ num: i + j + 1, text: t })),
      });
    }
  } else {
    // Default deck with the workspace name substituted for the legacy
    // hardcoded house name.
    const sub = (s: string) =>
      s.replaceAll("JSL Sober Living Residences", houseName).replaceAll("JSL", houseName);
    slides = RULES_SLIDES.map((sl) => ({
      ...sl,
      note: sl.note ? sub(sl.note) : undefined,
      warning: sl.warning ? sub(sl.warning) : undefined,
      items: sl.items?.map((it) => ({ ...it, text: sub(it.text) })),
      bullets: sl.bullets?.map(sub),
    }));
  }

  return (
    <RulesPresentation
      slides={slides}
      requireCheckoff={settings?.require_rule_checkoff ?? false}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import {
  getWorkspaceForUser,
  getWorkspace,
  getWorkspaceSettings,
} from "@/lib/workspace";
import { RulesPresentation } from "./rules-presentation";
import { buildRulesSlides } from "./rules-content";

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

  const slides = buildRulesSlides(
    workspace?.name ?? "the house",
    settings?.rules_text
  );

  return (
    <RulesPresentation
      slides={slides}
      requireCheckoff={settings?.require_rule_checkoff ?? false}
    />
  );
}

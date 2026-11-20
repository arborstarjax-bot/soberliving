/** Toggleable app sections (payments uses its own enable_payments flag). */
export const WORKSPACE_MODULES = [
  { slug: "chores", label: "Chores" },
  { slug: "discipline", label: "Discipline" },
  { slug: "attendance", label: "Attendance & Leave" },
  { slug: "bulletin", label: "Community Services" },
  { slug: "documents", label: "Resident Documents" },
] as const;

export type WorkspaceModule = (typeof WORKSPACE_MODULES)[number]["slug"];

/** No settings row / no workspace (legacy) → everything stays on. */
export function isModuleEnabled(
  settings: { enabled_modules?: string[] } | null | undefined,
  slug: WorkspaceModule
): boolean {
  if (!settings?.enabled_modules) return true;
  return settings.enabled_modules.includes(slug);
}

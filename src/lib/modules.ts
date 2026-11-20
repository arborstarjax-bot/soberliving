/** Toggleable app sections (payments uses its own enable_payments flag). */
export const WORKSPACE_MODULES = [
  { slug: "chores", label: "Chores" },
  { slug: "discipline", label: "Discipline" },
  { slug: "attendance", label: "Attendance & Leave" },
  { slug: "bulletin", label: "Community Services" },
  { slug: "documents", label: "Resident Documents" },
  { slug: "meetings", label: "Meetings" },
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

/**
 * Module check for a given role. Staff follow `enabled_modules`
 * alone; residents additionally need the module listed in
 * `resident_modules` when that column is set (NULL = residents see
 * everything the workspace has enabled).
 */
export function isModuleVisibleToRole(
  settings:
    | { enabled_modules?: string[]; resident_modules?: string[] | null }
    | null
    | undefined,
  slug: WorkspaceModule,
  role: "admin" | "manager" | "resident"
): boolean {
  if (!isModuleEnabled(settings, slug)) return false;
  if (role !== "resident") return true;
  const rm = settings?.resident_modules;
  if (!rm) return true;
  return rm.includes(slug);
}

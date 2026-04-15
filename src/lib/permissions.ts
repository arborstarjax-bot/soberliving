import type { SessionUser, UserRole } from "@/lib/types";

type Action = "view" | "create" | "edit" | "delete" | "approve";

type Entity =
  | "houses"
  | "rooms"
  | "beds"
  | "residents"
  | "bed_assignments"
  | "chores"
  | "chore_assignments"
  | "incidents"
  | "leave_requests"
  | "notes"
  | "activity_log"
  | "users"
  | "payments"
  | "rent_configs"
  | "demerits";

interface PermissionCheck {
  user: SessionUser;
  action: Action;
  entity: Entity;
  houseId?: string;
  residentId?: string;
  ownerId?: string; // for "own data" checks
}

const ADMIN_FULL_ACCESS: Action[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
];

const managerPermissions: Record<Entity, Action[]> = {
  houses: ["view"],
  rooms: ["view", "edit"],
  beds: ["view", "edit"],
  residents: ["view", "create", "edit"],
  bed_assignments: ["view", "create", "edit"],
  chores: ["view", "create"],
  chore_assignments: ["view", "create", "edit", "approve"],
  incidents: ["view", "create", "edit"],
  leave_requests: ["view", "create", "approve"],
  notes: ["view", "create", "edit"],
  activity_log: ["view"],
  users: ["view"],
  payments: ["view", "create", "edit"],
  rent_configs: ["view", "create", "edit"],
  demerits: ["view", "create", "edit"],
};

const residentPermissions: Record<Entity, Action[]> = {
  houses: [],
  rooms: [],
  beds: [],
  residents: ["view"],
  bed_assignments: ["view"],
  chores: ["view"],
  chore_assignments: ["view", "edit"], // edit = mark complete
  incidents: ["view"],
  leave_requests: ["view", "create"],
  notes: [],
  activity_log: ["view"],
  users: ["view"],
  payments: ["view"],
  rent_configs: [],
  demerits: ["view"],
};

export function authorize({
  user,
  action,
  entity,
  houseId,
}: PermissionCheck): boolean {
  if (user.role === "admin") {
    return ADMIN_FULL_ACCESS.includes(action);
  }

  if (user.role === "manager") {
    const allowed = managerPermissions[entity];
    if (!allowed?.includes(action)) return false;
    // Scope check: manager must be assigned to the house
    if (houseId && !user.assigned_house_ids.includes(houseId)) {
      return false;
    }
    return true;
  }

  if (user.role === "resident") {
    const allowed = residentPermissions[entity];
    return allowed?.includes(action) ?? false;
  }

  return false;
}

export function canAccessHouse(user: SessionUser, houseId: string): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager")
    return user.assigned_house_ids.includes(houseId);
  return false;
}

export function getAccessibleHouseFilter(
  user: SessionUser
): string[] | null {
  if (user.role === "admin") return null; // null = no filter (all houses)
  if (user.role === "manager") return user.assigned_house_ids;
  return [];
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "resident":
      return "Resident";
  }
}

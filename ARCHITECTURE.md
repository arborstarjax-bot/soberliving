# Sober Living — Architecture

Multi-workspace sober-living management PWA. Next.js 16 (App Router) + React 19 + Supabase (Postgres + Auth + Storage) on Vercel.

## Layout

- `src/app/` — route groups:
  - `(auth)` — login/register/reset
  - `(dashboard)` — the staff + resident app (one shell, role-gated)
  - `(intake)` — intake wizard, quick-signup, checklist
  - `(commitment)`, `(rules)`, `(check-in)`, `(blocker)` — focused signing/ack flows
  - `api/cron/` — 4 scheduled jobs (see below)
- `src/lib/` — shared pure helpers (see "Key lib modules")
- `src/components/` — shared UI (`ui/` = primitives, plus app-level components)
- `supabase/` — schema.sql + migrations (migrations are applied manually by the owner)

## Core concepts

- **Workspaces** — top-level tenant. Everything hangs off `users.workspace_id`; `workspace_settings` holds per-workspace config (modules, reminders, intake pipeline, timezone, pass approver, auto-demerits, check-in schedules).
- **Houses** — each workspace has houses → rooms → beds → `bed_assignments`. Houses have their own `timezone` (inherits workspace default).
- **Roles** — `admin` (workspace owner), `manager` (house staff), `resident`. `requireAuth`/`requireRole`/`canAccessHouse` from `src/lib/auth`/`permissions` gate every server action.
- **Residents vs users** — `users` = auth accounts; `residents` = house members (may or may not have a login yet, `residents.user_id` links them).
- **Chore rotation** — `chore_rotations` + `chore_rotation_assignments` + `chore_signoffs`; fairness algorithm in `src/lib/chore-rotation.ts`. Leave cover delegation derives entirely from approved `leave_requests` rows.
- **Notifications** — `notifications` table; `sendNotification`/`notifyHouseStaff`/`sendNotificationToAdmins` in `src/lib/notifications`. Categories in `notifications/categories.ts`.
- **RLS** — most tables are `authenticated`-select-only; mutations go through server actions with `createAdminClient` where RLS would hide rows (notably `leave_requests` for covering residents).

## Key lib modules

- `timezone.ts` — `getHouseToday(tz)`, `getHouseDayOfWeek`, `isoDateInTz`, `TIMEZONE_OPTIONS`, `isValidTimezone`. NEVER hardcode a timezone; take house/workspace tz.
- `workspace.ts` — `getWorkspace`, `getWorkspaceSettings`, `getHouseTimezone` (all `cache()`d).
- `chore-rotation.ts` — rotation generation + fair assignment.
- `payments/` — charges, intake-activation, receipt-pdf.
- `cursor.ts` / `pagination.ts` — cursor + offset pagination.
- `blockers.ts` — intake/onboarding blockers (rules sheet, ack requirements).
- `permissions.ts` — `canAccessHouse`, `getAccessibleHouseFilter`.

## Server action pattern

`"use server"` files named `actions.ts` (or `_actions/*.ts` for multi-file modules like chores):

1. `requireAuth`/`requireRole` → 2. zod-validate input → 3. scope check (`canAccessHouse`) → 4. mutate via `createClient`/`createAdminClient` → 5. `logActivity` + `sendNotification` (deferred via `after()` where possible) → 6. `revalidatePath`.

Return shape convention: `{ error: string }` on failure, `{}` or `{ data }` on success. (Being standardized to `ActionResult<T>` — see docs/CONVENTIONS.md.)

## Crons (Vercel scheduled, `CRON_SECRET` bearer auth)

- `api/cron/sweep-charges` — daily rent-charge generation + due reminders
- `api/cron/check-in-sender` — per-workspace scheduled check-in batches (workspace tz)
- `api/cron/chore-reminders` — noon + evening chore reminders + auto-demerits
- `api/cron/curfew-check` — every 15 min per-house curfew checks (house tz)

## Testing

`npx vitest run` — ~150 tests. Test files colocate (`*.test.ts`). `server-only` is stubbed via `vendor/server-only` alias → `tests/stubs/empty.ts`; each test file has `vi.mock("server-only", () => ({}))`. Server-action tests use vi.mock factories with inline `vi.fn()` (hoisting-safe) + a fakeDb builder — see `meetings/actions.test.ts` for the pattern.

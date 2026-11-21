# Conventions

## Server actions

Every `"use server"` action:

1. Auth first: `const user = await requireAuth()` or `requireRole("admin")`.
2. Validate input with a `zod` schema (from `src/lib/validations.ts` or local).
3. Scope check: `canAccessHouse(user, houseId)` for anything house-scoped; admins bypass.
4. Use `createClient()` for user-scoped reads, `createAdminClient()` when RLS would hide needed rows (e.g. covering residents on leave_requests).
5. Side effects last: `logActivity`, `sendNotification`, `revalidatePath`. Defer non-critical work with `after()` from `next/server`.

**Return contract (`ActionResult<T>`):**
```ts
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
```
New actions must use it. Legacy `{ error?: string }` shapes are being migrated — keep backwards-compat when touching them.

## Dates & timezones

- House timezone: `getHouseTimezone(houseId)` (cached). Workspace default: `getWorkspaceSettings(wsId).timezone`. Fallback `DEFAULT_TIMEZONE`.
- "Today" is always `getHouseToday(tz)` — never `new Date().toISOString().slice(0,10)` and never a hardcoded zone.
- Day-of-week: `getHouseDayOfWeek(tz)`. ISO in zone: `isoDateInTz`.

## Components

- `ui/` primitives only; feature components live beside their page.
- Empty lists → `<EmptyState icon title description />`.
- Signature capture → `<SignaturePad>` (wipes on `resetKey` change — use the render-adjustment pattern, not setState-in-effect).
- Contact info → `tel:`/`sms:`/`mailto:` links.

## Data access

- One fetch per concern; batch independent fetches in `Promise.all`.
- `cache()` (React) for per-request memoized reads (`getWorkspace*`, `getHouseTimezone`).
- Pagination: cursor (`lib/cursor.ts`) for feeds, offset (`lib/pagination.ts`) for tables.

## Notifications

- `sendNotification({userId, type, title, message, actionUrl, entityType, entityId})`.
- Category mapping lives in `notifications/categories.ts` — add new types there.
- Mark the triggering notification read when its inline action completes.

## Testing

- `vitest`. Colocate `*.test.ts`. Stub `server-only` per file.
- Server-action mocks: `vi.mock` factories with inline `vi.fn()`; `vi.mocked()` for refs; fakeDb builder pattern (see `meetings/actions.test.ts`).
- Never mock what you're testing through — test actions via their exported function with mocked auth/db.

## Migrations

- Numbered `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, idempotent (`if not exists`).
- Flag new migrations to David — he applies them manually to prod.

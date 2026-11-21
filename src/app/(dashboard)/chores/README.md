# Chores

Weekly rotation system: `chore_rotations` → `chore_rotation_assignments` → `chore_signoffs` (per-day, per-week).

- `_actions/` — rotations.ts (generation + fair auto-assign), signoffs.ts (review flow).
- `rotation-board.tsx` — staff board; covered chores show the coverer tagged "(C)".
- `resident-chore-view.tsx` — resident's own chores + "Covering for …" cards; while the viewer is on approved leave their own chores render read-only with a "Covered by …" badge.
- Cover delegation derives from approved `leave_requests` overlapping today — no extra tables; missed covered chores' auto-demerits go to the coverer.
- Gotcha: cover lookups must use `createAdminClient` (leave_requests RLS hides rows from the coverer).

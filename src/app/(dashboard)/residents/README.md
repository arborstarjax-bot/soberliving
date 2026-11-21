# Residents

Resident lifecycle: intake-funnel users → active residents → discharged.

- `page.tsx` — list; `residents-tabs.tsx` renders unified people cards (staff + residents) with tap-to-call/text/email actions.
- `[id]/page.tsx` — profile in 3 sections (Overview / Records / Intake). Includes commitment, bed assignment, transfer, discharge, amend-commitment.
- `actions.ts` — all resident mutations. House-scoped actions check `canAccessHouse`; transfers validate the target house is in the workspace.
- `check-ins/` — per-resident check-in records.
- Gotcha: `residents.user_id` may be null (pre-login residents). Use `createAdminClient` when RLS would hide a needed row.

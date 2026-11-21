# Admin

- `page.tsx` — admin dashboard grid.
- `workspace/` — all workspace settings, tabbed: General / Onboarding (modules, intake pipeline, rules, reminder toggles, check-in schedules, timezone, pass approver, auto-demerits) / Payments / Curfews / Members.
- `documents/` — admin document vault (email-share; `requires_intake_ack` flag forces resident signature during intake).
- Gotcha: saves are per-section — each card posts only its own columns so a missing migration can't block unrelated saves.

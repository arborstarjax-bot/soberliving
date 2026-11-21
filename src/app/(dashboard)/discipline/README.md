# Discipline

Demerits, warnings, restrictions (incl. house commitments).

- `demerit-matrix.tsx` — staff issue/adjust/void UI.
- Auto-demerits come from the curfew + chore-reminder crons gated by workspace toggles (`auto_demerit_*`).
- Restrictions have `start_date`/`end_date` in the house's timezone; expiry handled by queries, not a sweeper.

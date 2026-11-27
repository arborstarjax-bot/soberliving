# Database migrations

This repo manages Postgres schema changes via the [Supabase CLI](https://supabase.com/docs/guides/cli/managing-environments). Every schema or data change to the production database must go through a timestamped migration file in `supabase/migrations/`.

## Layout

```
supabase/
├── config.toml                       # Supabase CLI project config
├── migrations/
│   ├── YYYYMMDDHHMMSS_<name>.sql     # ordered chronologically by filename
│   └── ...
└── schema.sql                        # reference-only snapshot of the public + auth schemas
```

- **`migrations/` is the source of truth.** `schema.sql` is a human-readable snapshot for code review / grepping; it is NOT applied and NOT required to be up-to-date.
- Filenames sort chronologically because the prefix is `YYYYMMDDHHMMSS`. Do not rename or re-order existing migration files.

## Adding a new migration

```bash
npm run db:new -- <short_snake_case_name>
# -> supabase/migrations/<timestamp>_<short_snake_case_name>.sql
```

Open the generated file and write the SQL. Prefer idempotent patterns so a migration can be re-run without failing:

```sql
-- good
ALTER TABLE residents ADD COLUMN IF NOT EXISTS billing_anchor_date date;
CREATE TABLE IF NOT EXISTS …;
CREATE INDEX IF NOT EXISTS idx_foo ON …;

-- DO $$ block for conditional logic
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_charges_uniq_per_cycle'
  ) THEN
    ALTER TABLE payment_charges ADD CONSTRAINT payment_charges_uniq_per_cycle UNIQUE (resident_id, due_date, charge_type);
  END IF;
END $$;
```

Commit the new file alongside the code changes that depend on it.

## Applying migrations to the production database

**One-time setup** (per machine, per developer):

```bash
# Link this working copy to the Supabase project
npx supabase link --project-ref <project-ref>
# You will be prompted for the database password. Supabase stores the link
# in ./supabase/.temp/ (gitignored).
```

The project ref is the subdomain of the Supabase dashboard URL (e.g. `https://abcdefghijklm.supabase.co` → `abcdefghijklm`).

**Every subsequent deploy:**

```bash
npm run db:status     # show which migrations are pending against the linked project
npm run db:push       # apply pending migrations
```

`db:push` is transactional per migration. If one fails, the ones before it stay applied, and the failing migration and everything after remain pending. Fix the failing migration, commit the fix as a new migration (don't edit the failing file if it has already partially applied in any environment), and re-run `db:push`.

## Baseline (one-time, when adopting this workflow)

The 18 migrations in this repo predate the CLI adoption and have already been hand-applied to production. Before running `db:push` for the first time against an environment that already has those migrations applied, mark them as applied in the CLI's tracking table:

```bash
npx supabase link --project-ref <project-ref>

# Mark every pre-existing migration as "applied" so the CLI knows not to re-run
# them. Run this ONCE per environment (production, staging, etc.) being adopted.
npx supabase migration repair --status applied \
  20260415183735 \
  20260415190935 \
  20260415194852 \
  20260415195658 \
  20260415200731 \
  20260415200732 \
  20260415213213 \
  20260415225013 \
  20260416021119 \
  20260416041141 \
  20260416053252 \
  20260416062701 \
  20260416170444 \
  20260416175345 \
  20260417181431 \
  20260417193114 \
  20260418024436 \
  20260418035411

# Confirm they're all marked applied
npm run db:status
```

After this one-time baseline, all future changes go through `npm run db:new` + `npm run db:push`.

## Refreshing `supabase/schema.sql`

Optional. `schema.sql` is a reference snapshot; it is NOT applied and never needs to exist. If you want to regenerate it for code review or grepping:

```bash
npm run db:dump
```

This runs `supabase db dump --schema public --schema auth` against the linked project. Commit the updated file.

## When NOT to use migrations

- **Auth / dashboard-only settings** (e.g. OTP expiry, email templates, storage policy RLS via the Supabase dashboard UI) don't have a stable migration representation. Note them in the PR description but don't try to capture them in SQL unless you've verified the exact syntax. Example: `supabase/migrations/20260416021119_invite_link_24h.sql` documents a dashboard-only change.
- **Local-only schema experimentation** — just edit your local DB directly, then when you're happy, generate the migration with `supabase db diff -f <name>`.

## Troubleshooting

### "migration already applied" but it clearly wasn't

Check `npm run db:status`. If a row is marked applied locally but the change isn't in the DB, run `npx supabase migration repair --status reverted <timestamp>` and then `npm run db:push` to re-apply.

### Timestamp collision

Two migrations committed within the same second will have the same `YYYYMMDDHHMMSS` prefix. The CLI will complain. Bump the later file's prefix by one second and rename it.

### The CLI binary

The `supabase` npm package is a wrapper that downloads the platform-specific CLI binary on install. CI and local dev both use `npx supabase <cmd>`. No global install needed.

# Tier-3 C — SQL migration strategy proposal

**Status:** proposal. No SQL has been changed and no tooling has been installed. Approve the direction before any execution PR is opened.

---

## 1 · Current state audit

### Inventory

`supabase/` contains 19 hand-maintained `.sql` files:

| File | Kind |
|---|---|
| `schema.sql` | Baseline / "how the DB should look" reference dump |
| `fix_check_in_user_id.sql` | Hotfix (adds missing column) |
| `migration_add_*.sql` (11 files) | Forward-only feature migrations |
| `migration_backfill_missing_intake_charges.sql` | Data backfill (written this session) |
| `migration_bulletin_upgrades.sql` | Forward-only feature migration |
| `migration_chore_improvements.sql` | Forward-only feature migration (multi-phase, ~100 lines) |
| `migration_existing_tenant_activation.sql` | Forward-only feature migration |
| `migration_invite_link_24h.sql` | Docs-only (manual Supabase dashboard step) |
| `migration_polish_v1.sql` | Forward-only feature migration (~22k bytes — largest) |
| `migration_timezone_eastern.sql` | Config override |

### Workflow in use today

Comments in the files reveal the current process:

> `-- Run this in Supabase SQL Editor`
> `-- Run this in Supabase SQL Editor after the previous migrations`
> `-- Safe to re-run (idempotent)`

So the operational reality is: **a human opens the Supabase web SQL editor, pastes the file contents, and clicks Run.** There is no:

- `schema_migrations` / `supabase_migrations.schema_migrations` tracking table
- Supabase CLI configuration (`supabase/config.toml`, `.supabase/`) — neither exists
- CI job that runs migrations
- Runbook or README entry documenting the process
- Naming convention that sorts chronologically — alphabetical does **not** match the order the migrations were written (e.g. `add_check_ins` is newer than `add_chore_completions`, but sorts first)

### What's working

- **Idempotency is mostly honored.** Most files use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, or `DO $$ IF NOT EXISTS … END $$` blocks. This is the main reason drift hasn't bitten yet — a human can re-run a file and it usually no-ops.
- **Files are scoped.** Each migration is a single feature or hotfix, not a mixed grab-bag (with one exception, `migration_polish_v1.sql`, which bundles several polish items).
- **Git history provides a temporal ledger.** `git log --oneline --reverse -- supabase/` reconstructs the order we added migrations, even though filenames don't.

### What's broken or risky

1. **No tracking table.** Deploying an environment from scratch (or a new staging/dev DB) requires a human to read `git log`, list every migration file, decide which have been applied, and re-run the rest. Currently done by eyeballing `schema.sql` and hoping it matches.
2. **No ordering guarantee.** File names don't sort chronologically. `migration_chore_improvements.sql` depends on tables created in `migration_add_chore_completions.sql`, but alphabetical order puts `add_*` after `chore_improvements`. Nothing in the tooling enforces or communicates the real dependency order.
3. **`schema.sql` vs. migrations drift.** `schema.sql` is the baseline full-DB reference, but nothing automatically keeps it in sync when a new `migration_*.sql` is added. Over time these two sources of truth drift.
4. **Not every file is idempotent.** A few ALTER statements (notably in `migration_chore_improvements.sql` and `migration_polish_v1.sql`) are bare `ALTER TABLE … ADD COLUMN …` without `IF NOT EXISTS`. Re-running them in an environment that already has the column raises an error.
5. **Data migrations vs. schema migrations are mixed.** `migration_backfill_missing_intake_charges.sql` is a one-shot data fix; `migration_add_check_ins.sql` is a schema migration. Both live in the same pile with identical naming.
6. **Ad-hoc "fix_*" files.** `fix_check_in_user_id.sql` is a hotfix that assumes a prior migration didn't apply cleanly in some environments. Its role is unclear to anyone looking at the repo later — was it merged? was it backported? No tracker to answer that.

### Concrete drift risk right now

Low but rising. Today, the production DB is maintained by one human (you) running migrations manually against one Supabase project. As soon as any of the following happens, the risk compounds quickly:

- A second contributor adds a migration and you're not sure which environment has it
- You spin up a staging environment to test something — rebuilding schema from the current pile is a ~30-minute manual chore with a real chance of missing a file
- A migration half-applies (network drop mid-run) and the next re-run fails because part of it already happened
- You need to roll back a change — no down migrations exist and nothing tracks what was last applied

---

## 2 · Goals for a migration system here

In priority order:

1. **Zero ambiguity about what's been applied to which environment.** A DB somewhere, plus the repo, plus one command = "what's pending for this environment?"
2. **Deterministic ordering.** Filename sorts = apply order. No depending on git log or filesystem mtime.
3. **Low ceremony.** The team is one person today. The system should not require installing a 200MB Docker image just to rename a column.
4. **Doesn't break today's workflow immediately.** Existing `IF NOT EXISTS`-style migrations should keep working; no forced rewrite.
5. **Explicit separation of schema vs. data migrations.** (Nice-to-have, not required.)

---

## 3 · Options

### Option A — Adopt Supabase CLI migrations

**What it is:** Use the official [`supabase` CLI](https://supabase.com/docs/guides/cli/managing-environments) that already powers local dev against Supabase.

**Shape:**
- `supabase init` creates `supabase/config.toml` + moves migrations under `supabase/migrations/`
- Rename existing 18 migration files to `YYYYMMDDHHMMSS_<name>.sql` — derive timestamps from `git log` commit times to preserve true apply order
- Track applied migrations in the CLI-managed `supabase_migrations.schema_migrations` table (the CLI creates it automatically on first push)
- Use `supabase migration repair --status applied` to mark the 18 legacy files as "already applied" against the prod DB (they are)
- Going forward:
  - `supabase migration new add_foo` creates an empty timestamped file
  - `supabase db push` applies pending migrations against the linked project
  - `supabase db diff` generates a migration from local-vs-remote schema drift
- `schema.sql` becomes auto-generated from `supabase db dump --schema-only` instead of hand-maintained

**Pros:**
- First-class Postgres support via the Supabase team; bug fixes come for free
- Same workflow works against Supabase cloud AND `supabase start` local Docker Postgres (no setup cost you're not already paying if you ever want local dev)
- `schema_migrations` tracking solved automatically
- Timestamp filenames sort correctly and self-document when each migration was introduced
- Works with CI via `supabase db push --db-url $DATABASE_URL`

**Cons:**
- Adds a CLI dependency (`supabase` — distributed as a binary, not npm). One-line install, but a new thing
- `supabase init` creates files (`config.toml`, `seed.sql`, `functions/`) we don't use — harmless clutter
- Renaming the 18 legacy files creates a one-time churn commit

**Best fit when:** the team plans to use Supabase long-term (yes), wants parity between local/prod (probably yes), and values first-class tooling over custom scripts.

---

### Option B — Minimal homegrown tracker

**What it is:** Write a ~40-line Node.js script that reads `supabase/migrations/**/*.sql` in filename order, checks a `schema_migrations` table we own, runs each pending file inside a transaction, and records the hash + timestamp.

**Shape:**
- New table: `CREATE TABLE schema_migrations (filename text primary key, applied_at timestamptz, checksum text)`
- New script: `scripts/migrate.ts` connects via `SUPABASE_SERVICE_ROLE_KEY` + direct Postgres URL, iterates pending files, applies each in a tx
- Rename existing files to `YYYYMMDDHHMM__<name>.sql` for sort order
- `npm run migrate` runs pending migrations
- Split schema vs. data migrations into two folders: `supabase/migrations/schema/` and `supabase/migrations/data/`

**Pros:**
- Zero external tooling, no new binary to install
- Fits in one PR, fully auditable (~40 lines)
- Total control over error handling, logging, transaction boundaries
- Works identically in local dev, CI, and prod

**Cons:**
- We own the bug surface. Everything dbmate/Flyway/Supabase CLI has already solved (partial-apply recovery, parallel-runner lock, `IF NOT EXISTS` detection, etc.) we'd either skip or reinvent
- No `db diff` / schema-dump story — if the team wants "generate a migration from a schema change" later, we'd have to build it
- Harder to attract future contributors — "what's this script" vs. "oh, standard Supabase CLI"

**Best fit when:** the team is allergic to external CLIs and the migration volume is low enough that we'll never hit the edge cases mature tools handle.

---

### Option C — Pure rename + runbook (no code)

**What it is:** Don't introduce any tooling. Just solve the "ordering is ambiguous" and "did prod get this?" problems with filename conventions and a DEPLOYMENT.md checklist.

**Shape:**
- Rename `supabase/migration_*.sql` → `supabase/YYYYMMDDHHMM__<name>.sql` (timestamp derived from git log)
- Move hotfixes into a `hotfixes/` subfolder, data migrations into `data/`
- Add `supabase/README.md` explaining the convention + apply order
- Add `DEPLOYMENT.md` with a checklist: "applied in prod on YYYY-MM-DD by @user — tick here"

**Pros:**
- Zero code, zero new tooling, zero install
- Fixes the ordering ambiguity immediately
- Reversible — we can add tooling later on top of the renamed files

**Cons:**
- Still manual. Still depends on humans remembering to tick the checklist
- No actual `schema_migrations` table — the checklist IS the tracker
- Ad-hoc: the next drift scare won't be far away
- Doesn't address the `ALTER TABLE … ADD COLUMN` (non-idempotent) migrations

**Best fit when:** the team is confident nothing is going to scale from here — one DB, one human, one environment forever.

---

## 4 · Recommendation

**Option A (Supabase CLI)**, executed in two small PRs:

**PR 1 — Adopt CLI (non-breaking, reversible):**
- `supabase init` + commit `supabase/config.toml`
- Move existing files to `supabase/migrations/` with timestamp-prefixed names (timestamps backfilled from git log, preserving real apply order)
- Create `schema_migrations` baseline: `supabase migration repair --status applied` for every renamed file, so prod is marked up-to-date
- Add `npm run db:push` wrapper that invokes `supabase db push`
- Update `docs/` with a short "how to add a new migration" note
- Zero prod SQL executed. Just file moves + CLI metadata.

**PR 2 — Convert `schema.sql` to auto-generated (optional, low priority):**
- Add a `npm run db:dump` that runs `supabase db dump --schema-only > supabase/schema.sql`
- Document it as "regenerate after adding a migration if you want the reference updated"
- Could also be a post-migration hook; defer until the team hits a real need

**Why A over B:**
- The team is already on Supabase. Using its native tooling costs very little and gets us a mature system for free.
- The "we don't need a real tool" instinct is valid when the system is small, but migration tooling specifically is where "small" custom scripts age badly: the first partial-apply bug you hit at 3am is not the moment to be debugging your own 40-line runner.

**Why A over C:**
- Renaming without adding a tracker is security theater. The ordering bug gets fixed; the "is this applied?" question doesn't. Since the rename is the hardest part (has to happen in A too), doing just the rename without the tracker costs the same effort for a smaller win.

**What I'd explicitly NOT do:**
- Re-write or split `migration_polish_v1.sql` and `migration_chore_improvements.sql` retroactively — they're messy but they've already run in prod. Leave them.
- Add down-migrations — no mature Supabase shop I've seen actually uses them. Roll forward.
- Block on introducing local Supabase Docker dev. That's a separate tooling question; the migration system works without it.

---

## 5 · Risks

- **Timestamp reconstruction from git log.** When renaming existing files, the derived timestamp is the git commit time, not necessarily the time the migration was applied to prod. Low impact (only affects sort order on migrations that are all already applied), but worth acknowledging.
- **`supabase migration repair` requires a direct connection to the prod DB.** Needs `SUPABASE_DB_URL` (or equivalent) as a repo-scoped secret. I'll request it via the `secrets` tool when the execution PR is opened, not before.
- **CLI version drift.** Pin the Supabase CLI version in the repo setup (`package.json`'s `engines` or a top-level `.tool-versions` file) so everyone runs the same version.
- **PR 1 is rename-heavy.** Git diff will show 18 files as renames; reviewers should diff with `--find-renames` to see it's a pure move.

---

## 6 · Decision needed

Pick one:

- **A — adopt Supabase CLI (recommended).** I open PR 1 (rename + `supabase init` + baseline `schema_migrations`). You review. If approved, I open PR 2 (auto-dump schema) as a follow-up.
- **B — minimal homegrown tracker.** I open a PR with `scripts/migrate.ts` + `schema_migrations` table + folder split. You review.
- **C — rename + runbook only.** I open a PR renaming the files and adding `DEPLOYMENT.md`. You review. This does not fix the tracker gap — just ordering.
- **Defer entirely.** Close this proposal, stay on the current workflow. The refactor initiative ends here.

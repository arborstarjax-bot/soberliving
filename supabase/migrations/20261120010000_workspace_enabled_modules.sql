-- Per-workspace module entitlements: which app sections are visible.
-- Payments stays on its existing enable_payments flag.
alter table public.workspace_settings
  add column if not exists enabled_modules text[] not null
    default array['chores', 'discipline', 'attendance', 'bulletin', 'documents'];

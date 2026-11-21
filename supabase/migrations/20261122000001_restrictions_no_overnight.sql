-- The app added 'no_overnight' as a restriction type (used by
-- hasNoLeaveRestriction + the discipline dialogs) but the
-- restrictions_type_check constraint predates it, so choosing
-- "No Overnight" always failed with a constraint violation.
alter table public.restrictions
  drop constraint if exists restrictions_type_check;

alter table public.restrictions
  add constraint restrictions_type_check
  check (restriction_type in (
    'no_leave',
    'no_overnight',
    'weekend_restriction',
    'house_commitment',
    'curfew',
    'custom'
  ));

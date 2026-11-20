-- Meetings tab: residents log outside support meetings (AA/NA etc.)
-- with a facilitator signature captured on the resident's phone.
-- Visibility is enforced in server actions (residents see their own,
-- staff see their houses); RLS allows authenticated reads only.
create table if not exists public.meetings (
  id uuid primary key default uuid_generate_v4(),
  resident_id uuid not null
    references public.residents(id) on delete cascade,
  house_id uuid references public.houses(id) on delete set null,
  meeting_name text not null,
  location text not null,
  meeting_at timestamptz not null,
  facilitator_name text,
  -- Drawn signature as a PNG data URL (same pattern as check-ins
  -- and blocker acknowledgments).
  facilitator_signature text not null,
  -- Optional photo of the meeting sign-in sheet; stored in the
  -- `documents` bucket under <user_id>/meetings/.
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meetings_resident_time
  on public.meetings (resident_id, meeting_at desc);
create index if not exists idx_meetings_house_time
  on public.meetings (house_id, meeting_at desc);

alter table public.meetings enable row level security;
drop policy if exists "meetings_select" on public.meetings;
create policy "meetings_select"
  on public.meetings for select to authenticated using (true);

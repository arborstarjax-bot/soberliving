-- Ride Share posts — a new bulletin post type where a driver offers
-- seats on a trip (meeting, church, store, other). House-scoped
-- visibility (same as regular bulletin posts scoped to a single
-- house). Reservation is atomic and overbooking-safe via a Postgres
-- function that locks the ride row before counting + inserting.
--
-- Data model:
--   bulletin_posts.post_type          — 'standard' | 'ride_share'
--   ride_shares                        — ride-specific fields keyed by post_id
--   ride_share_reservations            — (post_id, user_id) one per seat
--
-- Residents see ride shares for their own house only; managers see
-- ride shares for their assigned houses; admins see all. This mirrors
-- the existing bulletin_posts visibility model which already filters
-- by house_id + user role at the server-action level.

-- ---- 1. Post type discriminator on bulletin_posts ----
alter table public.bulletin_posts
  add column if not exists post_type text not null default 'standard';

-- (Re)create the CHECK so it's in sync if the column already existed
-- from a prior partial run.
alter table public.bulletin_posts
  drop constraint if exists bulletin_posts_post_type_check;
alter table public.bulletin_posts
  add constraint bulletin_posts_post_type_check
  check (post_type in ('standard', 'ride_share'));

create index if not exists idx_bulletin_posts_post_type_created_desc
  on public.bulletin_posts (post_type, created_at desc);

-- ---- 2. ride_shares (1:1 extension of bulletin_posts) ----
create table if not exists public.ride_shares (
  post_id uuid primary key
    references public.bulletin_posts(id) on delete cascade,
  destination_type text not null
    check (destination_type in ('meeting', 'church', 'store', 'other')),
  destination_label text,
  seats_total smallint not null check (seats_total between 1 and 8),
  departure_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ride_shares_departure_at
  on public.ride_shares (departure_at);

-- ---- 3. ride_share_reservations ----
-- One row per reserved seat. Driver gets an auto-inserted reservation
-- at create-time so the car capacity (seats_total) can be shared with
-- riders without special-casing the driver in the seat math.
create table if not exists public.ride_share_reservations (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null
    references public.ride_shares(post_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists idx_ride_share_reservations_post
  on public.ride_share_reservations (post_id);
create index if not exists idx_ride_share_reservations_user
  on public.ride_share_reservations (user_id);

-- ---- 4. RLS passthrough ----
-- Application-layer enforcement for visibility (server actions use the
-- admin service-role client and filter by house). Enable RLS so any
-- authenticated direct access still needs an explicit policy; for now
-- allow SELECT to all authenticated callers. Mutations go through
-- server actions which use the service role.
alter table public.ride_shares enable row level security;
drop policy if exists "ride_shares_select" on public.ride_shares;
create policy "ride_shares_select"
  on public.ride_shares for select to authenticated using (true);

alter table public.ride_share_reservations enable row level security;
drop policy if exists "ride_share_reservations_select"
  on public.ride_share_reservations;
create policy "ride_share_reservations_select"
  on public.ride_share_reservations for select to authenticated using (true);

-- ---- 5. Overbooking-safe reservation RPC ----
-- Returns one of:
--   'ok'         — reservation inserted
--   'already'    — caller already had a reservation; no-op
--   'full'       — seats are full
--   'not_found'  — no such ride
--
-- Row-level lock on ride_shares prevents two concurrent callers from
-- both reading N-1 reservations and both inserting row N.
create or replace function public.reserve_ride_seat(
  p_post_id uuid,
  p_user_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seats_total smallint;
  v_reserved int;
  v_existing int;
begin
  select seats_total into v_seats_total
    from public.ride_shares
   where post_id = p_post_id
   for update;

  if not found then
    return 'not_found';
  end if;

  select count(*) into v_existing
    from public.ride_share_reservations
   where post_id = p_post_id and user_id = p_user_id;

  if v_existing > 0 then
    return 'already';
  end if;

  select count(*) into v_reserved
    from public.ride_share_reservations
   where post_id = p_post_id;

  if v_reserved >= v_seats_total then
    return 'full';
  end if;

  insert into public.ride_share_reservations (post_id, user_id)
  values (p_post_id, p_user_id);

  return 'ok';
end;
$$;

-- Unreserve is straightforward — delete is safe without locking since
-- a freed seat can't race into an overbook. Returns true if a row was
-- removed, false otherwise.
create or replace function public.unreserve_ride_seat(
  p_post_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.ride_share_reservations
   where post_id = p_post_id and user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.reserve_ride_seat(uuid, uuid) to authenticated, service_role;
grant execute on function public.unreserve_ride_seat(uuid, uuid) to authenticated, service_role;

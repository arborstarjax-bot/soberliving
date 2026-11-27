-- Tenant boundary lockdown: make workspace_members the single trust
-- anchor for role/workspace derivation, lock the self-editable
-- columns that previously decided tenancy, and scope the permissive
-- RLS policies/grants to the caller's workspace.

-- ---------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can read workspace_members
-- without recursive RLS evaluation)
-- ---------------------------------------------------------------
create or replace function public.my_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid() and status = 'active'
  order by joined_at asc
  limit 1
$$;

revoke all on function public.my_workspace_id() from public;
grant execute on function public.my_workspace_id() to authenticated;

create or replace function public.house_in_my_workspace(p_house_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.houses h
    where h.id = p_house_id
      and h.workspace_id = public.my_workspace_id()
  )
$$;

revoke all on function public.house_in_my_workspace(uuid) from public;
grant execute on function public.house_in_my_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Workspace tables: RLS was never enabled. Members may read their
-- own workspace/membership; writes go through the service role only.
-- ---------------------------------------------------------------
alter table public.workspaces enable row level security;
create policy "Members can view own workspace"
  on public.workspaces for select to authenticated
  using (id = public.my_workspace_id());

alter table public.workspace_members enable row level security;
create policy "Members can view workspace members"
  on public.workspace_members for select to authenticated
  using (workspace_id = public.my_workspace_id() or user_id = auth.uid());

do $$
begin
  if to_regclass('public.workspace_invites') is not null then
    alter table public.workspace_invites enable row level security;
    execute $pol$
      create policy "Members can view workspace invites"
        on public.workspace_invites for select to authenticated
        using (workspace_id = public.my_workspace_id())
    $pol$;
  end if;
  if to_regclass('public.workspace_settings') is not null then
    alter table public.workspace_settings enable row level security;
    execute $pol$
      create policy "Members can view workspace settings"
        on public.workspace_settings for select to authenticated
        using (workspace_id = public.my_workspace_id())
    $pol$;
  end if;
  if to_regclass('public.workspace_payment_config') is not null then
    alter table public.workspace_payment_config enable row level security;
    execute $pol$
      create policy "Members can view workspace payment config"
        on public.workspace_payment_config for select to authenticated
        using (workspace_id = public.my_workspace_id())
    $pol$;
  end if;
  if to_regclass('public.house_curfews') is not null then
    alter table public.house_curfews enable row level security;
  end if;
end $$;

-- ---------------------------------------------------------------
-- users: self-update must not touch tenancy / gatekeeping columns.
-- Column-level grants: authenticated users may update only profile
-- display fields on their own row. All other column writes go
-- through the service role.
-- ---------------------------------------------------------------
drop policy if exists "Users can update own profile" on public.users;
revoke update on public.users from authenticated, anon;
grant update (full_name, phone, avatar_url) on public.users to authenticated;
create policy "Users can update own profile fields"
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------
-- user_roles: global role table is no longer trusted. Keep read
-- access (legacy code still lists it) but authenticated users may
-- not write rows at all.
-- ---------------------------------------------------------------
drop policy if exists "Admins can manage user roles" on public.user_roles;
revoke insert, update, delete on public.user_roles from authenticated, anon;

-- ---------------------------------------------------------------
-- houses / rooms / beds / manager_house_assignments: scope to the
-- caller's workspace.
-- ---------------------------------------------------------------
drop policy if exists "Houses are viewable by authenticated users" on public.houses;
create policy "Workspace members view houses"
  on public.houses for select to authenticated
  using (workspace_id = public.my_workspace_id());

drop policy if exists "Admins can manage houses" on public.houses;
create policy "Workspace members manage houses"
  on public.houses for all to authenticated
  using (workspace_id = public.my_workspace_id())
  with check (workspace_id = public.my_workspace_id());

drop policy if exists "Rooms viewable by authenticated" on public.rooms;
create policy "Workspace members view rooms"
  on public.rooms for select to authenticated
  using (public.house_in_my_workspace(house_id));

drop policy if exists "Staff can manage rooms" on public.rooms;
create policy "Workspace members manage rooms"
  on public.rooms for all to authenticated
  using (public.house_in_my_workspace(house_id))
  with check (public.house_in_my_workspace(house_id));

drop policy if exists "Beds viewable by authenticated" on public.beds;
create policy "Workspace members view beds"
  on public.beds for select to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = beds.room_id
        and public.house_in_my_workspace(r.house_id)
    )
  );

drop policy if exists "Staff can manage beds" on public.beds;
create policy "Workspace members manage beds"
  on public.beds for all to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = beds.room_id
        and public.house_in_my_workspace(r.house_id)
    )
  )
  with check (
    exists (
      select 1 from public.rooms r
      where r.id = beds.room_id
        and public.house_in_my_workspace(r.house_id)
    )
  );

drop policy if exists "Manager assignments viewable by authenticated" on public.manager_house_assignments;
create policy "Workspace members view manager assignments"
  on public.manager_house_assignments for select to authenticated
  using (public.house_in_my_workspace(house_id));

drop policy if exists "Admins can manage manager assignments" on public.manager_house_assignments;
create policy "Workspace members manage manager assignments"
  on public.manager_house_assignments for all to authenticated
  using (public.house_in_my_workspace(house_id))
  with check (public.house_in_my_workspace(house_id));

-- ---------------------------------------------------------------
-- restrictions / warnings / demerits: scope by house_id.
-- ---------------------------------------------------------------
drop policy if exists restrictions_select_policy on public.restrictions;
drop policy if exists restrictions_insert_policy on public.restrictions;
drop policy if exists restrictions_update_policy on public.restrictions;
drop policy if exists restrictions_delete_policy on public.restrictions;
create policy "Workspace members view restrictions"
  on public.restrictions for select to authenticated
  using (public.house_in_my_workspace(house_id));
create policy "Workspace members manage restrictions"
  on public.restrictions for all to authenticated
  using (public.house_in_my_workspace(house_id))
  with check (public.house_in_my_workspace(house_id));

drop policy if exists "warnings_select" on public.warnings;
drop policy if exists "warnings_mutate" on public.warnings;
create policy "Workspace members view warnings"
  on public.warnings for select to authenticated
  using (public.house_in_my_workspace(house_id));
create policy "Workspace members manage warnings"
  on public.warnings for all to authenticated
  using (public.house_in_my_workspace(house_id))
  with check (public.house_in_my_workspace(house_id));

do $$
begin
  if to_regclass('public.demerits') is not null then
    drop policy if exists demerits_select_policy on public.demerits;
    drop policy if exists demerits_insert_policy on public.demerits;
    drop policy if exists demerits_update_policy on public.demerits;
    drop policy if exists demerits_delete_policy on public.demerits;
    execute $pol$
      create policy "Workspace members view demerits"
        on public.demerits for select to authenticated
        using (public.house_in_my_workspace(house_id))
    $pol$;
    execute $pol$
      create policy "Workspace members manage demerits"
        on public.demerits for all to authenticated
        using (public.house_in_my_workspace(house_id))
        with check (public.house_in_my_workspace(house_id))
    $pol$;
  end if;
end $$;

-- ---------------------------------------------------------------
-- chore_signoffs: scope through rotation_assignment → chore → house.
-- ---------------------------------------------------------------
drop policy if exists "Signoffs viewable by authenticated" on public.chore_signoffs;
create policy "Workspace members view signoffs"
  on public.chore_signoffs for select to authenticated
  using (
    exists (
      select 1
      from public.chore_rotation_assignments ra
      join public.chores c on c.id = ra.chore_id
      where ra.id = chore_signoffs.rotation_assignment_id
        and public.house_in_my_workspace(c.house_id)
    )
  );

drop policy if exists "Authenticated users can update signoffs" on public.chore_signoffs;
drop policy if exists "Staff can insert signoffs" on public.chore_signoffs;
drop policy if exists "Staff can delete signoffs" on public.chore_signoffs;
create policy "Workspace members manage signoffs"
  on public.chore_signoffs for all to authenticated
  using (
    exists (
      select 1
      from public.chore_rotation_assignments ra
      join public.chores c on c.id = ra.chore_id
      where ra.id = chore_signoffs.rotation_assignment_id
        and public.house_in_my_workspace(c.house_id)
    )
  )
  with check (
    exists (
      select 1
      from public.chore_rotation_assignments ra
      join public.chores c on c.id = ra.chore_id
      where ra.id = chore_signoffs.rotation_assignment_id
        and public.house_in_my_workspace(c.house_id)
    )
  );

-- ---------------------------------------------------------------
-- check-in batches/responses: replace USING(true) policies.
-- ---------------------------------------------------------------
drop policy if exists check_in_batches_select on public.check_in_batches;
drop policy if exists check_in_batches_insert on public.check_in_batches;
create policy check_in_batches_select on public.check_in_batches
  for select to authenticated
  using (
    exists (
      select 1 from public.houses h
      where h.id = any (check_in_batches.house_ids)
        and h.workspace_id = public.my_workspace_id()
    )
  );
create policy check_in_batches_insert on public.check_in_batches
  for insert to authenticated
  with check (
    not exists (
      select 1 from public.houses h
      where h.id = any (check_in_batches.house_ids)
        and h.workspace_id <> public.my_workspace_id()
    )
  );

drop policy if exists check_in_responses_select on public.check_in_responses;
drop policy if exists check_in_responses_insert on public.check_in_responses;
drop policy if exists check_in_responses_update on public.check_in_responses;
create policy check_in_responses_select on public.check_in_responses
  for select to authenticated
  using (public.house_in_my_workspace(house_id) or user_id = auth.uid());
create policy check_in_responses_insert on public.check_in_responses
  for insert to authenticated
  with check (public.house_in_my_workspace(house_id));
create policy check_in_responses_update on public.check_in_responses
  for update to authenticated
  using (public.house_in_my_workspace(house_id) or user_id = auth.uid())
  with check (public.house_in_my_workspace(house_id) or user_id = auth.uid());

-- ---------------------------------------------------------------
-- house_documents table + storage objects: scope by house/workspace.
-- Storage object names are `${house_id}/...` paths, so the first
-- path segment must resolve to a house in the caller's workspace.
-- ---------------------------------------------------------------
drop policy if exists "house_documents_select" on public.house_documents;
create policy "house_documents_select"
  on public.house_documents for select to authenticated
  using (public.house_in_my_workspace(house_id));

drop policy if exists "house_documents_mutate" on public.house_documents;
create policy "house_documents_mutate"
  on public.house_documents for all to authenticated
  using (public.house_in_my_workspace(house_id))
  with check (public.house_in_my_workspace(house_id));

drop policy if exists "house_documents_storage_select" on storage.objects;
create policy "house_documents_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'house-documents'
    and exists (
      select 1 from public.houses h
      where h.id = (storage.foldername(name))[1]::uuid
        and h.workspace_id = public.my_workspace_id()
    )
  );

drop policy if exists "house_documents_storage_insert" on storage.objects;
create policy "house_documents_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'house-documents'
    and exists (
      select 1 from public.houses h
      where h.id = (storage.foldername(name))[1]::uuid
        and h.workspace_id = public.my_workspace_id()
    )
  );

drop policy if exists "house_documents_storage_delete" on storage.objects;
create policy "house_documents_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'house-documents'
    and exists (
      select 1 from public.houses h
      where h.id = (storage.foldername(name))[1]::uuid
        and h.workspace_id = public.my_workspace_id()
    )
  );

-- ---------------------------------------------------------------
-- delete_workspace_cascade: service-role only. It is SECURITY
-- DEFINER and must never be callable by end users.
-- ---------------------------------------------------------------
revoke execute on function public.delete_workspace_cascade(uuid) from public, anon, authenticated;
grant execute on function public.delete_workspace_cascade(uuid) to service_role;

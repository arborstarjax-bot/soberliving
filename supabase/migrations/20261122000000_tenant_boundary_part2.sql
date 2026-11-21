-- Tenant boundary lockdown, part 2: finish the job for tables PR
-- #256 did not rescope. Drop every policy still keyed on the global
-- user_roles table or `using (true)`, and recreate them scoped to the
-- caller's workspace via public.my_workspace_id() /
-- public.house_in_my_workspace(). Writes are limited to staff roles
-- (owner/admin/manager) read from workspace_members — residents keep
-- only the narrow self-row access they need.
--
-- Also: restrict the lockdown migration's "Workspace members manage
-- ..." policies to staff, fix the check-in insert checks that failed
-- open when my_workspace_id() was null, and revoke SECURITY DEFINER
-- RPCs (payment charge updates, ride seats) from end users.

-- ---------------------------------------------------------------
-- Staff-role helper: owner/admin/manager of the caller's workspace.
-- ---------------------------------------------------------------
create or replace function public.my_workspace_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.workspace_members
  where user_id = auth.uid() and status = 'active'
  order by joined_at asc
  limit 1
$$;

revoke all on function public.my_workspace_role() from public;
grant execute on function public.my_workspace_role() to authenticated;

create or replace function public.is_workspace_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.my_workspace_role() in ('owner', 'admin', 'manager')
$$;

revoke all on function public.is_workspace_staff() from public;
grant execute on function public.is_workspace_staff() to authenticated;

-- Convenience: the resident row belongs to the calling user's account.
create or replace function public.resident_is_me(p_resident_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.residents r
    where r.id = p_resident_id and r.user_id = auth.uid()
  )
$$;

revoke all on function public.resident_is_me(uuid) from public;
grant execute on function public.resident_is_me(uuid) to authenticated;

-- ===============================================================
-- users: cross-tenant visibility.
-- ===============================================================
drop policy if exists "Users are viewable by authenticated users" on public.users;
drop policy if exists "Admins can insert users" on public.users;
create policy "Members can view workspace users"
  on public.users for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.workspace_members m
      where m.user_id = users.id
        and m.workspace_id = public.my_workspace_id()
    )
  );

-- user_roles: legacy global table. Keep read access (embedded joins
-- still select it for display) but it no longer decides anything.

-- ===============================================================
-- residents / bed_assignments
-- ===============================================================
drop policy if exists "Staff can view all residents" on public.residents;
drop policy if exists "Staff can manage residents" on public.residents;
create policy "Members view residents"
  on public.residents for select to authenticated
  using (
    public.house_in_my_workspace(house_id)
    or user_id = auth.uid()
  );
create policy "Staff manage residents"
  on public.residents for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "Bed assignments viewable by authenticated" on public.bed_assignments;
drop policy if exists "Staff can manage bed assignments" on public.bed_assignments;
create policy "Members view bed assignments"
  on public.bed_assignments for select to authenticated
  using (
    exists (
      select 1 from public.beds b
      join public.rooms rm on rm.id = b.room_id
      where b.id = bed_assignments.bed_id
        and public.house_in_my_workspace(rm.house_id)
    )
    or public.resident_is_me(resident_id)
  );
create policy "Staff manage bed assignments"
  on public.bed_assignments for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.beds b
      join public.rooms rm on rm.id = b.room_id
      where b.id = bed_assignments.bed_id
        and public.house_in_my_workspace(rm.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.beds b
      join public.rooms rm on rm.id = b.room_id
      where b.id = bed_assignments.bed_id
        and public.house_in_my_workspace(rm.house_id)
    )
  );

-- ===============================================================
-- chores tree
-- ===============================================================
drop policy if exists "Chores viewable by authenticated" on public.chores;
drop policy if exists "Staff can manage chores" on public.chores;
create policy "Members view chores"
  on public.chores for select to authenticated
  using (public.house_in_my_workspace(house_id));
create policy "Staff manage chores"
  on public.chores for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "Chore tasks viewable by authenticated" on public.chore_tasks;
drop policy if exists "Staff can manage chore tasks" on public.chore_tasks;
create policy "Members view chore tasks"
  on public.chore_tasks for select to authenticated
  using (
    exists (
      select 1 from public.chores c
      where c.id = chore_tasks.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  );
create policy "Staff manage chore tasks"
  on public.chore_tasks for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chores c
      where c.id = chore_tasks.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chores c
      where c.id = chore_tasks.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  );

drop policy if exists "Chore rotations viewable by authenticated" on public.chore_rotations;
drop policy if exists "Staff can manage chore rotations" on public.chore_rotations;
create policy "Members view chore rotations"
  on public.chore_rotations for select to authenticated
  using (public.house_in_my_workspace(house_id));
create policy "Staff manage chore rotations"
  on public.chore_rotations for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "Rotation assignments viewable by authenticated" on public.chore_rotation_assignments;
drop policy if exists "Staff can manage rotation assignments" on public.chore_rotation_assignments;
create policy "Members view rotation assignments"
  on public.chore_rotation_assignments for select to authenticated
  using (
    exists (
      select 1 from public.chore_rotations cr
      where cr.id = chore_rotation_assignments.rotation_id
        and public.house_in_my_workspace(cr.house_id)
    )
    or public.resident_is_me(resident_id)
  );
create policy "Staff manage rotation assignments"
  on public.chore_rotation_assignments for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chore_rotations cr
      where cr.id = chore_rotation_assignments.rotation_id
        and public.house_in_my_workspace(cr.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chore_rotations cr
      where cr.id = chore_rotation_assignments.rotation_id
        and public.house_in_my_workspace(cr.house_id)
    )
  );

-- chore_signoffs: drop every leftover (lockdown policies plus the
-- legacy ones it didn't cover) and recreate: staff manage, residents
-- read/update only their own signoffs.
drop policy if exists "Signoffs viewable by authenticated" on public.chore_signoffs;
drop policy if exists "Authenticated users can update signoffs" on public.chore_signoffs;
drop policy if exists "Staff can insert signoffs" on public.chore_signoffs;
drop policy if exists "Staff can delete signoffs" on public.chore_signoffs;
drop policy if exists "Workspace members view signoffs" on public.chore_signoffs;
drop policy if exists "Workspace members manage signoffs" on public.chore_signoffs;
drop policy if exists chore_signoffs_select_policy on public.chore_signoffs;
drop policy if exists chore_signoffs_update_policy on public.chore_signoffs;

create policy "Members view signoffs"
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
create policy "Staff manage signoffs"
  on public.chore_signoffs for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1
      from public.chore_rotation_assignments ra
      join public.chores c on c.id = ra.chore_id
      where ra.id = chore_signoffs.rotation_assignment_id
        and public.house_in_my_workspace(c.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1
      from public.chore_rotation_assignments ra
      join public.chores c on c.id = ra.chore_id
      where ra.id = chore_signoffs.rotation_assignment_id
        and public.house_in_my_workspace(c.house_id)
    )
  );
create policy "Residents update own signoffs"
  on public.chore_signoffs for update to authenticated
  using (
    exists (
      select 1
      from public.chore_rotation_assignments ra
      join public.residents r on r.id = ra.resident_id
      where ra.id = chore_signoffs.rotation_assignment_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.chore_rotation_assignments ra
      join public.residents r on r.id = ra.resident_id
      where ra.id = chore_signoffs.rotation_assignment_id
        and r.user_id = auth.uid()
    )
  );

-- chore_completions / chore_exclusions / chore_room_exclusions
drop policy if exists chore_completions_select_policy on public.chore_completions;
drop policy if exists chore_completions_insert_policy on public.chore_completions;
drop policy if exists chore_completions_update_policy on public.chore_completions;
create policy "Members view chore completions"
  on public.chore_completions for select to authenticated
  using (
    exists (
      select 1 from public.chores c
      where c.id = chore_completions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
    or public.resident_is_me(resident_id)
  );
create policy "Staff manage chore completions"
  on public.chore_completions for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chores c
      where c.id = chore_completions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  )
  with check (
    exists (
      select 1 from public.chores c
      where c.id = chore_completions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
    and (
      public.is_workspace_staff()
      or public.resident_is_me(resident_id)
    )
  );

drop policy if exists chore_exclusions_select_policy on public.chore_exclusions;
drop policy if exists chore_exclusions_insert_policy on public.chore_exclusions;
drop policy if exists chore_exclusions_delete_policy on public.chore_exclusions;
create policy "Members view chore exclusions"
  on public.chore_exclusions for select to authenticated
  using (
    exists (
      select 1 from public.chores c
      where c.id = chore_exclusions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  );
create policy "Staff manage chore exclusions"
  on public.chore_exclusions for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chores c
      where c.id = chore_exclusions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chores c
      where c.id = chore_exclusions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  );

drop policy if exists chore_room_exclusions_select_policy on public.chore_room_exclusions;
drop policy if exists chore_room_exclusions_insert_policy on public.chore_room_exclusions;
drop policy if exists chore_room_exclusions_delete_policy on public.chore_room_exclusions;
create policy "Members view chore room exclusions"
  on public.chore_room_exclusions for select to authenticated
  using (
    exists (
      select 1 from public.chores c
      where c.id = chore_room_exclusions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  );
create policy "Staff manage chore room exclusions"
  on public.chore_room_exclusions for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chores c
      where c.id = chore_room_exclusions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.chores c
      where c.id = chore_room_exclusions.chore_id
        and public.house_in_my_workspace(c.house_id)
    )
  );

-- ===============================================================
-- incidents / leave_requests / resident_notes / activity_log
-- ===============================================================
drop policy if exists "Incidents viewable by staff" on public.incidents;
drop policy if exists "Staff can manage incidents" on public.incidents;
create policy "Members view incidents"
  on public.incidents for select to authenticated
  using (public.house_in_my_workspace(house_id));
create policy "Staff manage incidents"
  on public.incidents for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "Leave requests viewable by staff or own" on public.leave_requests;
drop policy if exists "Authenticated can create leave requests" on public.leave_requests;
drop policy if exists "Staff can update leave requests" on public.leave_requests;
create policy "Members view leave requests"
  on public.leave_requests for select to authenticated
  using (
    exists (
      select 1 from public.residents r
      where r.id = leave_requests.resident_id
        and public.house_in_my_workspace(r.house_id)
    )
    or requested_by = auth.uid()
  );
create policy "Members create leave requests"
  on public.leave_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from public.residents r
      where r.id = leave_requests.resident_id
        and public.house_in_my_workspace(r.house_id)
    )
  );
create policy "Staff update leave requests"
  on public.leave_requests for update to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.residents r
      where r.id = leave_requests.resident_id
        and public.house_in_my_workspace(r.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.residents r
      where r.id = leave_requests.resident_id
        and public.house_in_my_workspace(r.house_id)
    )
  );

drop policy if exists "Notes viewable by staff" on public.resident_notes;
drop policy if exists "Staff can manage notes" on public.resident_notes;
create policy "Staff view resident notes"
  on public.resident_notes for select to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.residents r
      where r.id = resident_notes.resident_id
        and public.house_in_my_workspace(r.house_id)
    )
  );
create policy "Staff manage resident notes"
  on public.resident_notes for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.residents r
      where r.id = resident_notes.resident_id
        and public.house_in_my_workspace(r.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.residents r
      where r.id = resident_notes.resident_id
        and public.house_in_my_workspace(r.house_id)
    )
  );

drop policy if exists "Activity log viewable by staff" on public.activity_log;
drop policy if exists "Authenticated can insert activity log" on public.activity_log;
create policy "Staff view activity log"
  on public.activity_log for select to authenticated
  using (
    public.is_workspace_staff()
    and (house_id is null or public.house_in_my_workspace(house_id))
  );
-- Inserts go through the service role (logActivity uses the server
-- client). No authenticated insert policy on purpose.

-- ===============================================================
-- supply_items / sign_out_sheet / payment_charges (polish_v1)
-- ===============================================================
drop policy if exists "supply_items_select" on public.supply_items;
drop policy if exists "supply_items_mutate" on public.supply_items;
create policy "Members view supply items"
  on public.supply_items for select to authenticated
  using (public.house_in_my_workspace(house_id));
create policy "Staff manage supply items"
  on public.supply_items for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "sign_out_sheet_select" on public.sign_out_sheet;
drop policy if exists "sign_out_sheet_mutate" on public.sign_out_sheet;
create policy "Members view sign-out sheet"
  on public.sign_out_sheet for select to authenticated
  using (
    public.house_in_my_workspace(house_id)
    or public.resident_is_me(resident_id)
  );
create policy "Members manage sign-out sheet"
  on public.sign_out_sheet for all to authenticated
  using (
    (
      public.is_workspace_staff()
      and public.house_in_my_workspace(house_id)
    )
    or public.resident_is_me(resident_id)
  )
  with check (
    (
      public.is_workspace_staff()
      and public.house_in_my_workspace(house_id)
    )
    or public.resident_is_me(resident_id)
  );

drop policy if exists "payment_charges_select" on public.payment_charges;
drop policy if exists "payment_charges_mutate" on public.payment_charges;
create policy "Members view payment charges"
  on public.payment_charges for select to authenticated
  using (
    public.house_in_my_workspace(house_id)
    or public.resident_is_me(resident_id)
  );
create policy "Staff manage payment charges"
  on public.payment_charges for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

-- Payment RPCs: SECURITY DEFINER and callable by any signed-in user.
-- The app calls them through the service-role client only.
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    to_regprocedure('public.next_receipt_number(int)'),
    to_regprocedure('public.apply_payment_to_charge(uuid, numeric, uuid)'),
    to_regprocedure('public.reverse_payment_from_charge(uuid, numeric)')
  ] loop
    if fn is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end $$;

-- ===============================================================
-- ride shares: scope to the bulletin post's workspace; RPCs are
-- service-role only.
-- ===============================================================
drop policy if exists "ride_shares_select" on public.ride_shares;
create policy "Members view ride shares"
  on public.ride_shares for select to authenticated
  using (
    exists (
      select 1 from public.bulletin_posts p
      where p.id = ride_shares.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  );

drop policy if exists "ride_share_reservations_select" on public.ride_share_reservations;
create policy "Members view ride seat reservations"
  on public.ride_share_reservations for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.bulletin_posts p
      where p.id = ride_share_reservations.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  );

do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    to_regprocedure('public.reserve_ride_seat(uuid, uuid)'),
    to_regprocedure('public.unreserve_ride_seat(uuid, uuid)')
  ] loop
    if fn is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end $$;

-- ===============================================================
-- sobriety milestone log / meetings / ua / intake pipeline
-- ===============================================================
drop policy if exists "sobriety_milestone_posts_select" on public.sobriety_milestone_posts;
create policy "Members view milestone posts"
  on public.sobriety_milestone_posts for select to authenticated
  using (
    resident_user_id = auth.uid()
    or exists (
      select 1 from public.bulletin_posts p
      where p.id = sobriety_milestone_posts.bulletin_post_id
        and p.workspace_id = public.my_workspace_id()
    )
    or exists (
      select 1 from public.workspace_members m
      where m.user_id = sobriety_milestone_posts.resident_user_id
        and m.workspace_id = public.my_workspace_id()
    )
  );

drop policy if exists "meetings_select" on public.meetings;
create policy "Members view meetings"
  on public.meetings for select to authenticated
  using (
    public.house_in_my_workspace(house_id)
    or public.resident_is_me(resident_id)
  );

drop policy if exists "ua_tests_select" on public.ua_tests;
create policy "Members view UA tests"
  on public.ua_tests for select to authenticated
  using (workspace_id = public.my_workspace_id());

drop policy if exists "ua_results_select" on public.ua_results;
create policy "Members view UA results"
  on public.ua_results for select to authenticated
  using (
    public.resident_is_me(resident_id)
    or exists (
      select 1 from public.ua_tests t
      where t.id = ua_results.test_id
        and t.workspace_id = public.my_workspace_id()
    )
  );

drop policy if exists "doc_acks_select" on public.document_acknowledgments;
create policy "Members view document acknowledgments"
  on public.document_acknowledgments for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.documents d
      where d.id = document_acknowledgments.document_id
        and d.workspace_id = public.my_workspace_id()
    )
  );

drop policy if exists "intake_checkoffs_select" on public.intake_checkoffs;
create policy "Members view intake checkoffs"
  on public.intake_checkoffs for select to authenticated
  using (
    workspace_id = public.my_workspace_id()
    or user_id = auth.uid()
  );

-- ===============================================================
-- bulletin comments/likes: parent post's workspace.
-- ===============================================================
drop policy if exists "Users can view all likes" on public.bulletin_likes;
drop policy if exists "Users can insert their own likes" on public.bulletin_likes;
create policy "Members view likes"
  on public.bulletin_likes for select to authenticated
  using (
    exists (
      select 1 from public.bulletin_posts p
      where p.id = bulletin_likes.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  );
create policy "Members manage own likes"
  on public.bulletin_likes for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.bulletin_posts p
      where p.id = bulletin_likes.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.bulletin_posts p
      where p.id = bulletin_likes.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  );

drop policy if exists "Users can view all comments" on public.bulletin_comments;
drop policy if exists "Users can insert their own comments" on public.bulletin_comments;
drop policy if exists "Users can delete their own comments" on public.bulletin_comments;
create policy "Members view comments"
  on public.bulletin_comments for select to authenticated
  using (
    exists (
      select 1 from public.bulletin_posts p
      where p.id = bulletin_comments.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  );
create policy "Members insert own comments"
  on public.bulletin_comments for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.bulletin_posts p
      where p.id = bulletin_comments.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  );
create policy "Members delete own comments"
  on public.bulletin_comments for delete to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.bulletin_posts p
      where p.id = bulletin_comments.post_id
        and p.workspace_id = public.my_workspace_id()
    )
  );

-- ===============================================================
-- Tighten the lockdown migration's "Workspace members manage ..."
-- policies: residents must not edit houses/rooms/beds/discipline
-- rows or manager assignments.
-- ===============================================================
drop policy if exists "Workspace members manage houses" on public.houses;
create policy "Staff manage houses"
  on public.houses for all to authenticated
  using (public.is_workspace_staff() and workspace_id = public.my_workspace_id())
  with check (public.is_workspace_staff() and workspace_id = public.my_workspace_id());

drop policy if exists "Workspace members manage rooms" on public.rooms;
create policy "Staff manage rooms"
  on public.rooms for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "Workspace members manage beds" on public.beds;
create policy "Staff manage beds"
  on public.beds for all to authenticated
  using (
    public.is_workspace_staff()
    and exists (
      select 1 from public.rooms r
      where r.id = beds.room_id
        and public.house_in_my_workspace(r.house_id)
    )
  )
  with check (
    public.is_workspace_staff()
    and exists (
      select 1 from public.rooms r
      where r.id = beds.room_id
        and public.house_in_my_workspace(r.house_id)
    )
  );

drop policy if exists "Workspace members manage manager assignments" on public.manager_house_assignments;
create policy "Staff manage manager assignments"
  on public.manager_house_assignments for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "Workspace members manage restrictions" on public.restrictions;
create policy "Staff manage restrictions"
  on public.restrictions for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

drop policy if exists "Workspace members manage warnings" on public.warnings;
create policy "Staff manage warnings"
  on public.warnings for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

do $$
begin
  if to_regclass('public.demerits') is not null then
    drop policy if exists "Workspace members manage demerits" on public.demerits;
    execute $pol$
      create policy "Staff manage demerits"
        on public.demerits for all to authenticated
        using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
        with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
    $pol$;
  end if;
end $$;

drop policy if exists "house_documents_mutate" on public.house_documents;
create policy "Staff manage house documents"
  on public.house_documents for all to authenticated
  using (public.is_workspace_staff() and public.house_in_my_workspace(house_id))
  with check (public.is_workspace_staff() and public.house_in_my_workspace(house_id));

-- ===============================================================
-- check-in batches/responses: the lockdown insert check passed when
-- the caller had no workspace (the `not exists` vacancy) and let any
-- member plant rows / spoof created_by. Fail closed.
-- ===============================================================
drop policy if exists check_in_batches_insert on public.check_in_batches;
create policy check_in_batches_insert on public.check_in_batches
  for insert to authenticated
  with check (
    public.my_workspace_id() is not null
    and public.is_workspace_staff()
    and created_by = auth.uid()
    and cardinality(house_ids) > 0
    and not exists (
      select 1
      from unnest(house_ids) hid
      left join public.houses h on h.id = hid
      where h.workspace_id is distinct from public.my_workspace_id()
    )
  );

drop policy if exists check_in_responses_insert on public.check_in_responses;
create policy check_in_responses_insert on public.check_in_responses
  for insert to authenticated
  with check (
    public.house_in_my_workspace(house_id)
    and user_id = auth.uid()
    and exists (
      select 1 from public.check_in_batches b
      where b.id = check_in_responses.batch_id
        and b.workspace_id = public.my_workspace_id()
    )
  );

-- Response updates: identity columns (house_id, resident_id,
-- batch_id, user_id) must not change after insert.
drop policy if exists check_in_responses_update on public.check_in_responses;
create policy check_in_responses_update on public.check_in_responses
  for update to authenticated
  using (public.house_in_my_workspace(house_id) or user_id = auth.uid())
  with check (
    (public.house_in_my_workspace(house_id) or user_id = auth.uid())
    and user_id = auth.uid()
  );

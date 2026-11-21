-- Workspace self-deletion (App Store guideline 5.1.1): one SECURITY DEFINER
-- function that removes every row belonging to a workspace, driven by
-- information_schema so it survives schema growth — any table carrying a
-- workspace_id / house_id / resident_id / user_id column gets swept.
-- Retried in passes so FK-dependent deletes run after their parents'
-- cascades instead of erroring.
create or replace function public.delete_workspace_cascade(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_houses uuid[];
  v_residents uuid[];
  v_users uuid[];
  v_pending text[];          -- statements still to run
  v_next text[] := '{}';
  v_stmt text;
  v_pass int;
begin
  select coalesce(array_agg(id), '{}') into v_houses
    from houses where workspace_id = p_workspace_id;
  select coalesce(array_agg(id), '{}') into v_residents
    from residents where house_id = any(v_houses);
  select coalesce(array_agg(id), '{}') into v_users
    from users where workspace_id = p_workspace_id;

  select array_agg(stmt) into v_pending from (
    select format('delete from public.%I where house_id = any($1)', table_name) stmt
      from information_schema.columns
      where table_schema = 'public' and column_name = 'house_id'
    union all
    select format('delete from public.%I where resident_id = any($1)', table_name)
      from information_schema.columns
      where table_schema = 'public' and column_name = 'resident_id'
    union all
    select format('delete from public.%I where user_id = any($1)', table_name)
      from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'
    union all
    select format('delete from public.%I where workspace_id = $1', table_name)
      from information_schema.columns
      where table_schema = 'public' and column_name = 'workspace_id'
        and table_name <> 'workspaces'
  ) s;

  -- Up to 5 passes; statements that fail on an FK get retried next pass,
  -- after sibling rows (and their cascades) have been removed.
  for v_pass in 1..5 loop
    v_next := '{}';
    foreach v_stmt in array v_pending loop
      begin
        if v_stmt like '%resident_id%' then
          execute v_stmt using v_residents;
        elsif v_stmt like '%user_id%' then
          execute v_stmt using v_users;
        elsif v_stmt like '%workspace_id%' then
          execute v_stmt using p_workspace_id;
        else
          execute v_stmt using v_houses;
        end if;
      exception when others then
        v_next := v_next || v_stmt;
      end;
    end loop;
    exit when coalesce(array_length(v_next, 1), 0) = 0;
    v_pending := v_next;
  end loop;

  if coalesce(array_length(v_pending, 1), 0) > 0 then
    raise exception 'delete_workspace_cascade: % statements could not run: %',
      array_length(v_pending, 1), v_pending;
  end if;

  delete from residents where house_id = any(v_houses);
  delete from users where workspace_id = p_workspace_id;
  delete from houses where workspace_id = p_workspace_id;
  delete from workspaces where id = p_workspace_id;
end;
$$;

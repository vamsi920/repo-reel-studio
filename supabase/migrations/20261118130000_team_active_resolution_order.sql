-- Makes every existing "which team is this user in?" lookup follow the team
-- switcher, without redeploying anything.
--
-- Two kinds of code resolve a user's team as "their oldest membership"
-- (`org_members ... order by created_at asc limit 1`) and cannot be updated
-- in step with this migration:
--   * the Edge Functions already deployed (`_shared/org.ts::getCallerOrgId`)
--     -- connections, the environment profile and probes all write to the
--     team that lookup returns;
--   * browsers and installed desktop apps still running the previous
--     frontend, whose bootstrap does the same lookup.
-- If they kept answering "the personal team" while the new frontend showed
-- another one, a connection saved from a team's screen would land in the
-- user's personal team.
--
-- So the lookup is made to return the right team: `org_members.created_at`
-- becomes the RESOLUTION ORDER, and the real join date moves to a new
-- `joined_at` column. For each user, the membership of their active team
-- carries the earliest possible `created_at`; every other membership keeps
-- `created_at = joined_at`. Switching teams moves the marker.
--
-- Once every Edge Function is redeployed with the new `getCallerOrgId`
-- (which reads `user_team_preferences`) and no old frontend is in use,
-- `team_sync_resolution_order` can become a no-op. Nothing else depends on
-- the marker.

alter table org_members add column if not exists joined_at timestamptz;
update org_members set joined_at = created_at where joined_at is null;
alter table org_members alter column joined_at set default now();
alter table org_members alter column joined_at set not null;

-- Puts `active_org` first in the caller's resolution order and restores every
-- other membership to its real join date. Writes only the rows that differ,
-- so calling it on every resolve costs two index lookups.
create or replace function team_sync_resolution_order(target_user uuid, active_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  first_in_order constant timestamptz := 'epoch'::timestamptz;
begin
  update org_members
  set created_at = joined_at
  where user_id = target_user
    and org_id <> active_org
    and created_at <> joined_at;

  update org_members
  set created_at = first_in_order
  where user_id = target_user
    and org_id = active_org
    and created_at <> first_in_order;
end;
$$;

revoke execute on function team_sync_resolution_order(uuid, uuid) from public, anon, authenticated;

create or replace function resolve_active_team()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  personal_id uuid;
  chosen_id uuid;
  result jsonb;
begin
  if caller is null then
    perform team_fail('not_signed_in');
  end if;

  personal_id := ensure_personal_team();

  select p.active_org_id into chosen_id
  from user_team_preferences p
  join orgs o on o.id = p.active_org_id and o.archived_at is null
  join org_members m on m.org_id = o.id and m.user_id = caller
  where p.user_id = caller;

  chosen_id := coalesce(chosen_id, personal_id);
  perform team_sync_resolution_order(caller, chosen_id);

  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'is_personal', o.is_personal,
    'role', m.role
  ) into result
  from orgs o
  join org_members m on m.org_id = o.id and m.user_id = caller
  where o.id = chosen_id;

  return result;
end;
$$;

create or replace function set_active_team(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    perform team_fail('not_signed_in');
  end if;
  perform team_require_org(target_org);
  if team_member_role(target_org, caller) is null then
    perform team_fail('team_not_found');
  end if;

  insert into user_team_preferences (user_id, active_org_id, updated_at)
  values (caller, target_org, now())
  on conflict (user_id) do update
    set active_org_id = excluded.active_org_id, updated_at = now();

  perform team_sync_resolution_order(caller, target_org);
end;
$$;

-- Losing the active team (removed, left, team deleted) hands the resolution
-- order back to the personal team at once, rather than at the next resolve.
create or replace function org_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  personal_id uuid;
begin
  delete from workspace_members wm
  using workspaces w
  where w.id = wm.workspace_id
    and w.org_id = old.org_id
    and wm.user_id = old.user_id;

  update user_team_preferences
  set active_org_id = null, updated_at = now()
  where user_id = old.user_id and active_org_id = old.org_id;

  if found then
    select o.id into personal_id from orgs o
    where o.created_by = old.user_id and o.is_personal and o.archived_at is null;
    if personal_id is not null then
      perform team_sync_resolution_order(old.user_id, personal_id);
    end if;
  end if;

  return old;
end;
$$;

-- The join date people see is the real one.
-- (Return type unchanged, so this replaces the function in place.)
create or replace function list_team_members(target_org uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz,
  invited_by_email text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform team_require_role(target_org, 'viewer');
  return query
    select
      m.user_id,
      team_user_email(m.user_id),
      m.role,
      m.joined_at,
      team_user_email(m.invited_by)
    from org_members m
    where m.org_id = target_org
    order by team_role_rank(m.role) desc, m.joined_at asc;
end;
$$;

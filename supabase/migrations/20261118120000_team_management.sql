-- Team and workspace management.
--
-- Until now an org was an invisible join key: every user got one "Personal"
-- org and nothing let a second person in. This migration turns `orgs` into a
-- team people can create, switch between, invite others to and administer,
-- and gives `workspaces` a visibility so a team's folders are shared with the
-- team (or restricted to named people).
--
-- Vocabulary used in the app: a TEAM is an `orgs` row; a WORKSPACE is a
-- `workspaces` row (a folder/project a team works in).
--
-- Rules enforced here rather than in the browser:
--   * every team always has at least one owner
--   * only an owner can grant, change or remove the owner role
--   * a personal team has exactly one member and cannot be deleted or left
--   * invitations are bound to an email address; only that address accepts
--   * a removed member loses every explicit workspace grant in that team
--
-- All writes go through SECURITY DEFINER functions with a pinned search_path.
-- Each raises `P0001` with a short machine code as its message (for example
-- `last_owner`); src/lib/teams/errors.ts maps those to translated copy.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table orgs
  add column if not exists is_personal boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table org_members
  add column if not exists invited_by uuid references auth.users (id) on delete set null;

alter table org_members drop constraint if exists org_members_role_check;
alter table org_members
  add constraint org_members_role_check
  check (role in ('owner', 'admin', 'member', 'viewer'));

alter table workspaces
  add column if not exists visibility text not null default 'team',
  add column if not exists created_by uuid default auth.uid()
    references auth.users (id) on delete set null;

alter table workspaces drop constraint if exists workspaces_visibility_check;
alter table workspaces
  add constraint workspaces_visibility_check
  check (visibility in ('team', 'restricted'));

-- ---------------------------------------------------------------------------
-- Personal teams: exactly one per user.
--
-- The old bootstrap created a fresh "Personal" org whenever its membership
-- lookup failed, so some users own several. The earliest one a user joined is
-- the one every resolver has always returned ("oldest membership wins"), so
-- that one becomes the personal team. The later duplicates are archived, not
-- deleted: they are hidden from every list but nothing is destroyed.
-- ---------------------------------------------------------------------------

with ranked as (
  select
    o.id,
    row_number() over (
      partition by o.created_by
      order by m.created_at asc, o.created_at asc
    ) as rn
  from orgs o
  join org_members m on m.org_id = o.id and m.user_id = o.created_by
  where o.created_by is not null
    and o.name = 'Personal'
    and (select count(*) from org_members x where x.org_id = o.id) = 1
)
update orgs o
set
  is_personal = (ranked.rn = 1),
  archived_at = case when ranked.rn = 1 then null else now() end
from ranked
where ranked.id = o.id;

create unique index if not exists orgs_one_personal_per_user
  on orgs (created_by)
  where is_personal;

-- A direct insert (the legacy browser bootstrap, still used by clients that
-- have not picked up `ensure_personal_team`) creates a personal team; the
-- unique index above then rejects a second one instead of silently
-- duplicating. `create_team` passes `is_personal = false` explicitly.
alter table orgs alter column is_personal set default true;

create or replace function orgs_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Rows written by a backend process (no creator) are never personal.
    if new.created_by is null then
      new.is_personal := false;
    end if;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists orgs_before_write on orgs;
create trigger orgs_before_write
  before insert or update on orgs
  for each row execute function orgs_before_write();

-- A workspace never changes team as a side effect. The browser upserts its
-- workspace row with whatever team is active; before this trigger, doing that
-- after switching teams quietly moved the workspace (and everything keyed on
-- it) into the other team.
create or replace function workspaces_keep_org()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.org_id := old.org_id;
  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workspaces_keep_org on workspaces;
create trigger workspaces_keep_org
  before update on workspaces
  for each row execute function workspaces_keep_org();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Which team a user is working in. Kept in the database (not only in the
-- browser) because Edge Functions resolve the caller's team too, and both
-- sides must agree.
create table if not exists user_team_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_org_id uuid references orgs (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table user_team_preferences enable row level security;

drop policy if exists "users read their team preference" on user_team_preferences;
create policy "users read their team preference"
  on user_team_preferences for select
  using (user_id = (select auth.uid()));

create table if not exists team_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  -- Always stored trimmed and lower-cased.
  email text not null,
  role text not null check (role in ('admin', 'member', 'viewer')),
  -- sha256 of the link token. The token itself is returned once, to the
  -- person who created or regenerated the invitation, and never stored.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  declined_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists team_invites_one_open_per_email
  on team_invites (org_id, email)
  where accepted_at is null and declined_at is null and revoked_at is null;
create index if not exists team_invites_email_idx on team_invites (email);
create index if not exists team_invites_invited_by_idx on team_invites (invited_by);
create index if not exists team_invites_accepted_by_idx on team_invites (accepted_by);

alter table team_invites enable row level security;

drop policy if exists "team admins read invitations" on team_invites;
create policy "team admins read invitations"
  on team_invites for select
  using (has_org_role(org_id, 'admin'));

create table if not exists team_audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  -- Copied at write time so the log still reads correctly after the actor's
  -- account is gone.
  actor_email text,
  action text not null,
  target_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_audit_log_org_idx
  on team_audit_log (org_id, created_at desc);
create index if not exists team_audit_log_actor_idx on team_audit_log (actor_id);

alter table team_audit_log enable row level security;

drop policy if exists "team admins read the audit log" on team_audit_log;
create policy "team admins read the audit log"
  on team_audit_log for select
  using (has_org_role(org_id, 'admin'));

create index if not exists org_members_invited_by_idx on org_members (invited_by);
create index if not exists workspaces_created_by_idx on workspaces (created_by);
create index if not exists user_team_preferences_org_idx
  on user_team_preferences (active_org_id);

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function team_role_rank(role_name text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case role_name
    when 'owner' then 4
    when 'admin' then 3
    when 'member' then 2
    when 'viewer' then 1
    else 0
  end;
$$;

create or replace function has_org_role(target_org_id uuid, min_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and team_role_rank(min_role) > 0
      and team_role_rank(role) >= team_role_rank(min_role)
  );
$$;

-- What the caller may do in a workspace: the stronger of an explicit grant
-- (`workspace_members`) and what their team role implies. Team owners and
-- admins administer every workspace in the team. Everyone else reaches a
-- workspace through the team only while its visibility is 'team'; a
-- 'restricted' workspace needs an explicit grant.
create or replace function workspace_effective_role(ws_id text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  with explicit as (
    select role
    from workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  ),
  implied as (
    select case
      when m.role in ('owner', 'admin') then 'admin'
      when w.visibility = 'team' then m.role
      else null
    end as role
    from workspaces w
    join org_members m on m.org_id = w.org_id and m.user_id = auth.uid()
    where w.id = ws_id
  ),
  candidates as (
    select role from explicit
    union all
    select role from implied
  )
  select role
  from candidates
  where role is not null
  order by team_role_rank(role) desc
  limit 1;
$$;

create or replace function is_workspace_member(ws_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select workspace_effective_role(ws_id) is not null;
$$;

create or replace function has_workspace_role(ws_id text, min_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select team_role_rank(min_role) > 0
    and team_role_rank(workspace_effective_role(ws_id)) >= team_role_rank(min_role);
$$;

-- Used by the self-join policy below. A policy on `workspace_members` cannot
-- query `workspace_members` itself (infinite recursion), so the check lives
-- in a definer function.
create or replace function workspace_can_claim_ownership(ws_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from workspaces w
    where w.id = ws_id
      and has_org_role(w.org_id, 'member')
      and (
        w.created_by = auth.uid()
        or not exists (
          select 1 from workspace_members m where m.workspace_id = w.id
        )
        -- Already a member: let the insert through so it ends in the
        -- unique-violation the browser reads as "already joined".
        or exists (
          select 1 from workspace_members m
          where m.workspace_id = w.id and m.user_id = auth.uid()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

create or replace function team_fail(code text)
returns void
language plpgsql
set search_path = public
as $$
begin
  raise exception '%', code using errcode = 'P0001';
end;
$$;

-- The caller's id, refusing a missing session and the anonymous bootstrap
-- session: a team is shared with real people, so it needs a real account.
create or replace function team_require_user()
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  anonymous boolean;
begin
  if caller is null then
    perform team_fail('not_signed_in');
  end if;
  select coalesce(u.is_anonymous, false) into anonymous
  from auth.users u where u.id = caller;
  if not found or anonymous then
    perform team_fail('not_signed_in');
  end if;
  return caller;
end;
$$;

create or replace function team_user_email(target_user uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select lower(trim(u.email)) from auth.users u where u.id = target_user;
$$;

create or replace function team_member_role(target_org uuid, target_user uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from org_members
  where org_id = target_org and user_id = target_user;
$$;

-- Loads a live (not archived) team or fails.
create or replace function team_require_org(target_org uuid)
returns orgs
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  team orgs;
begin
  select * into team from orgs where id = target_org and archived_at is null;
  if not found then
    perform team_fail('team_not_found');
  end if;
  return team;
end;
$$;

-- The caller's role in a team, failing unless it is at least `min_role`.
-- A non-member gets `team_not_found`, never `not_authorized`: whether a team
-- id exists is not something to confirm to someone outside it.
create or replace function team_require_role(target_org uuid, min_role text)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  caller_role text;
begin
  perform team_require_org(target_org);
  caller_role := team_member_role(target_org, caller);
  if caller_role is null then
    perform team_fail('team_not_found');
  end if;
  if team_role_rank(caller_role) < team_role_rank(min_role) then
    perform team_fail('not_authorized');
  end if;
  return caller_role;
end;
$$;

create or replace function team_log(
  target_org uuid,
  action_name text,
  label text default null,
  details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into team_audit_log (org_id, actor_id, actor_email, action, target_label, metadata)
  values (
    target_org,
    auth.uid(),
    team_user_email(auth.uid()),
    action_name,
    label,
    coalesce(details, '{}'::jsonb)
  );
end;
$$;

create or replace function team_clean_name(raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text := regexp_replace(trim(coalesce(raw, '')), '\s+', ' ', 'g');
begin
  if char_length(cleaned) < 2 or char_length(cleaned) > 60 then
    perform team_fail('invalid_name');
  end if;
  return cleaned;
end;
$$;

create or replace function team_hash_token(token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(token, 'sha256'), 'hex');
$$;

create or replace function team_new_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select encode(gen_random_bytes(24), 'hex');
$$;

create or replace function team_invite_status(invite team_invites)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when invite.accepted_at is not null then 'accepted'
    when invite.revoked_at is not null then 'revoked'
    when invite.declined_at is not null then 'declined'
    when invite.expires_at <= now() then 'expired'
    else 'pending'
  end;
$$;

-- Leaving a team (by any route) drops the person's explicit workspace grants
-- there and stops that team being their active one.
create or replace function org_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from workspace_members wm
  using workspaces w
  where w.id = wm.workspace_id
    and w.org_id = old.org_id
    and wm.user_id = old.user_id;

  update user_team_preferences
  set active_org_id = null, updated_at = now()
  where user_id = old.user_id and active_org_id = old.org_id;

  return old;
end;
$$;

drop trigger if exists org_members_after_delete on org_members;
create trigger org_members_after_delete
  after delete on org_members
  for each row execute function org_members_after_delete();

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

-- The caller's personal team, created on first use. One statement instead of
-- the browser's old insert-org-then-insert-membership pair, which left an org
-- with no member (and the user permanently without a team) when the second
-- request failed.
create or replace function ensure_personal_team()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  team_id uuid;
begin
  if caller is null then
    perform team_fail('not_signed_in');
  end if;

  select id into team_id from orgs
  where created_by = caller and is_personal and archived_at is null;

  if team_id is null then
    begin
      insert into orgs (name, created_by, is_personal)
      values ('Personal', caller, true)
      returning id into team_id;
    exception when unique_violation then
      select id into team_id from orgs
      where created_by = caller and is_personal;
    end;
  end if;

  insert into org_members (org_id, user_id, role)
  values (team_id, caller, 'owner')
  on conflict (org_id, user_id) do nothing;

  return team_id;
end;
$$;

-- The team the caller is working in: their saved choice while it is still a
-- live team they belong to, otherwise their personal team.
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

create or replace function list_my_teams()
returns table (
  id uuid,
  name text,
  is_personal boolean,
  role text,
  member_count bigint,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    perform team_fail('not_signed_in');
  end if;
  return query
    select
      o.id,
      o.name,
      o.is_personal,
      m.role,
      (select count(*) from org_members x where x.org_id = o.id),
      o.created_at
    from org_members m
    join orgs o on o.id = m.org_id
    where m.user_id = caller and o.archived_at is null
    order by o.is_personal desc, lower(o.name), o.created_at;
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
end;
$$;

create or replace function create_team(team_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  cleaned text := team_clean_name(team_name);
  team_id uuid;
begin
  if (
    select count(*) from org_members m
    join orgs o on o.id = m.org_id
    where m.user_id = caller and m.role = 'owner'
      and not o.is_personal and o.archived_at is null
  ) >= 25 then
    perform team_fail('too_many_teams');
  end if;

  insert into orgs (name, created_by, is_personal)
  values (cleaned, caller, false)
  returning id into team_id;

  insert into org_members (org_id, user_id, role)
  values (team_id, caller, 'owner');

  perform team_log(team_id, 'team.created', cleaned);
  return team_id;
end;
$$;

create or replace function rename_team(target_org uuid, team_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := team_clean_name(team_name);
  team orgs;
begin
  perform team_require_role(target_org, 'admin');
  team := team_require_org(target_org);
  if team.is_personal then
    perform team_fail('personal_team');
  end if;
  if team.name = cleaned then
    return;
  end if;

  update orgs set name = cleaned where id = target_org;
  perform team_log(
    target_org, 'team.renamed', cleaned,
    jsonb_build_object('from', team.name, 'to', cleaned)
  );
end;
$$;

-- Deleting a team removes everything scoped to it (workspaces, connections,
-- profiles, knowledge). The caller must be an owner and must repeat the
-- team's name, so a mis-click cannot do it.
create or replace function delete_team(target_org uuid, confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team orgs;
begin
  perform team_require_role(target_org, 'owner');
  team := team_require_org(target_org);
  if team.is_personal then
    perform team_fail('personal_team');
  end if;
  if trim(coalesce(confirm_name, '')) <> team.name then
    perform team_fail('confirmation_mismatch');
  end if;

  delete from orgs where id = target_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

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
      m.created_at,
      team_user_email(m.invited_by)
    from org_members m
    where m.org_id = target_org
    order by team_role_rank(m.role) desc, m.created_at asc;
end;
$$;

create or replace function team_owner_count(target_org uuid)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*) from org_members where org_id = target_org and role = 'owner';
$$;

create or replace function update_team_member_role(
  target_org uuid,
  target_user uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  caller_role text := team_require_role(target_org, 'admin');
  existing_role text;
begin
  if new_role not in ('owner', 'admin', 'member', 'viewer') then
    perform team_fail('invalid_role');
  end if;

  -- Serialise role changes per team so two concurrent demotions cannot both
  -- pass the "is there another owner" check.
  perform 1 from orgs where id = target_org for update;

  existing_role := team_member_role(target_org, target_user);
  if existing_role is null then
    perform team_fail('member_not_found');
  end if;
  if existing_role = new_role then
    return;
  end if;

  if (existing_role = 'owner' or new_role = 'owner') and caller_role <> 'owner' then
    perform team_fail('owner_required');
  end if;
  if existing_role = 'owner' and team_owner_count(target_org) <= 1 then
    perform team_fail('last_owner');
  end if;
  -- Nobody raises their own role.
  if target_user = caller
    and team_role_rank(new_role) > team_role_rank(existing_role) then
    perform team_fail('not_authorized');
  end if;

  update org_members set role = new_role
  where org_id = target_org and user_id = target_user;

  perform team_log(
    target_org, 'member.role_changed', team_user_email(target_user),
    jsonb_build_object('from', existing_role, 'to', new_role)
  );
end;
$$;

create or replace function remove_team_member(target_org uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  caller_role text := team_require_role(target_org, 'admin');
  existing_role text;
  label text;
begin
  if target_user = caller then
    perform team_fail('use_leave');
  end if;

  perform 1 from orgs where id = target_org for update;

  existing_role := team_member_role(target_org, target_user);
  if existing_role is null then
    perform team_fail('member_not_found');
  end if;
  if existing_role = 'owner' and caller_role <> 'owner' then
    perform team_fail('owner_required');
  end if;
  if existing_role = 'owner' and team_owner_count(target_org) <= 1 then
    perform team_fail('last_owner');
  end if;

  label := team_user_email(target_user);
  delete from org_members where org_id = target_org and user_id = target_user;
  perform team_log(
    target_org, 'member.removed', label, jsonb_build_object('role', existing_role)
  );
end;
$$;

create or replace function leave_team(target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  caller_role text := team_require_role(target_org, 'viewer');
  team orgs;
begin
  team := team_require_org(target_org);
  if team.is_personal then
    perform team_fail('personal_team');
  end if;

  perform 1 from orgs where id = target_org for update;

  if caller_role = 'owner' and team_owner_count(target_org) <= 1 then
    perform team_fail('last_owner');
  end if;

  -- Logged before the membership goes, while the caller is still a member.
  perform team_log(
    target_org, 'member.left', team_user_email(caller),
    jsonb_build_object('role', caller_role)
  );
  delete from org_members where org_id = target_org and user_id = caller;
end;
$$;

-- Hands the team to another member: they become an owner and the caller
-- steps down to admin, in one transaction so the team is never ownerless.
create or replace function transfer_team_ownership(target_org uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  team orgs;
begin
  perform team_require_role(target_org, 'owner');
  team := team_require_org(target_org);
  if team.is_personal then
    perform team_fail('personal_team');
  end if;
  if target_user = caller then
    perform team_fail('invalid_target');
  end if;

  perform 1 from orgs where id = target_org for update;

  if team_member_role(target_org, target_user) is null then
    perform team_fail('member_not_found');
  end if;

  update org_members set role = 'owner'
  where org_id = target_org and user_id = target_user;
  update org_members set role = 'admin'
  where org_id = target_org and user_id = caller;

  perform team_log(target_org, 'team.ownership_transferred', team_user_email(target_user));
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

-- Invites each address in `emails`. Returns one row per address with what
-- happened: 'invited' (new), 'reinvited' (an open invitation was refreshed,
-- its old link stops working), 'already_member', 'invalid_email' or
-- 'domain_not_allowed' (this deployment restricts sign-up to listed domains,
-- so that person could never create the account to accept with). `token` is
-- set only for the first two and is the only time it is ever returned.
create or replace function create_team_invites(
  target_org uuid,
  emails text[],
  invite_role text
)
returns table (email text, status text, invite_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  caller_role text := team_require_role(target_org, 'admin');
  team orgs;
  raw text;
  cleaned text;
  seen text[] := '{}';
  new_token text;
  new_id uuid;
  existing_id uuid;
  allowlisted boolean;
  open_count integer;
begin
  team := team_require_org(target_org);
  if team.is_personal then
    perform team_fail('personal_team');
  end if;
  if invite_role not in ('admin', 'member', 'viewer') then
    perform team_fail('invalid_role');
  end if;
  if emails is null or coalesce(array_length(emails, 1), 0) = 0 then
    perform team_fail('no_emails');
  end if;
  if array_length(emails, 1) > 50 then
    perform team_fail('too_many_emails');
  end if;

  allowlisted := exists (select 1 from signup_domain_allowlist);

  foreach raw in array emails loop
    cleaned := lower(trim(coalesce(raw, '')));
    continue when cleaned = '' or cleaned = any (seen);
    seen := seen || cleaned;

    if cleaned !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(cleaned) > 254 then
      return query select cleaned, 'invalid_email'::text, null::uuid, null::text;
      continue;
    end if;

    if exists (
      select 1 from org_members m
      join auth.users u on u.id = m.user_id
      where m.org_id = target_org and lower(trim(u.email)) = cleaned
    ) then
      return query select cleaned, 'already_member'::text, null::uuid, null::text;
      continue;
    end if;

    -- Someone who already has an account can accept whatever their domain;
    -- the allowlist only stops accounts being created.
    if allowlisted
      and not exists (select 1 from auth.users u where lower(trim(u.email)) = cleaned)
      and not exists (
        select 1 from signup_domain_allowlist d
        where lower(d.domain) = split_part(cleaned, '@', 2)
      ) then
      return query select cleaned, 'domain_not_allowed'::text, null::uuid, null::text;
      continue;
    end if;

    new_token := team_new_token();
    existing_id := null;

    select i.id into existing_id from team_invites i
    where i.org_id = target_org and i.email = cleaned
      and i.accepted_at is null and i.declined_at is null and i.revoked_at is null;

    if existing_id is not null then
      update team_invites i set
        role = invite_role,
        token_hash = team_hash_token(new_token),
        invited_by = caller,
        expires_at = now() + interval '7 days'
      where i.id = existing_id;
      perform team_log(
        target_org, 'invite.resent', cleaned, jsonb_build_object('role', invite_role)
      );
      return query select cleaned, 'reinvited'::text, existing_id, new_token;
      continue;
    end if;

    select count(*) into open_count from team_invites i
    where i.org_id = target_org
      and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
      and i.expires_at > now();
    if open_count >= 200 then
      perform team_fail('too_many_invites');
    end if;

    insert into team_invites (org_id, email, role, token_hash, invited_by)
    values (target_org, cleaned, invite_role, team_hash_token(new_token), caller)
    returning id into new_id;
    perform team_log(
      target_org, 'invite.created', cleaned, jsonb_build_object('role', invite_role)
    );
    return query select cleaned, 'invited'::text, new_id, new_token;
  end loop;
end;
$$;

create or replace function list_team_invites(target_org uuid)
returns table (
  id uuid,
  email text,
  role text,
  status text,
  invited_by_email text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform team_require_role(target_org, 'admin');
  return query
    select
      i.id,
      i.email,
      i.role,
      team_invite_status(i),
      team_user_email(i.invited_by),
      i.created_at,
      i.expires_at
    from team_invites i
    where i.org_id = target_org
      and i.accepted_at is null and i.revoked_at is null
    order by i.created_at desc;
end;
$$;

create or replace function revoke_team_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite team_invites;
begin
  perform team_require_user();
  select * into invite from team_invites where id = invite_id;
  if not found then
    perform team_fail('invite_not_found');
  end if;
  perform team_require_role(invite.org_id, 'admin');
  if invite.accepted_at is not null then
    perform team_fail('invite_already_accepted');
  end if;
  if invite.revoked_at is not null then
    return;
  end if;

  update team_invites set revoked_at = now() where id = invite_id;
  perform team_log(invite.org_id, 'invite.revoked', invite.email);
end;
$$;

-- Issues a fresh link for an open or expired invitation and gives it another
-- seven days. A declined one is invited again from scratch instead. The previous link stops working.
create or replace function regenerate_team_invite(invite_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  invite team_invites;
  new_token text := team_new_token();
begin
  select * into invite from team_invites where id = invite_id;
  if not found then
    perform team_fail('invite_not_found');
  end if;
  perform team_require_role(invite.org_id, 'admin');
  if invite.accepted_at is not null then
    perform team_fail('invite_already_accepted');
  end if;
  if invite.revoked_at is not null then
    perform team_fail('invite_revoked');
  end if;
  if invite.declined_at is not null then
    perform team_fail('invite_declined');
  end if;

  update team_invites set
    token_hash = team_hash_token(new_token),
    expires_at = now() + interval '7 days',
    invited_by = caller
  where id = invite_id;
  perform team_log(invite.org_id, 'invite.resent', invite.email);
  return new_token;
end;
$$;

-- What an invitation link points at, for the page that asks the person to
-- accept it. Readable by anyone signed in who holds the link; it reveals the
-- team's name and the invited address, nothing else.
create or replace function get_team_invite(invite_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  invite team_invites;
  team orgs;
  caller_email text;
begin
  if caller is null then
    perform team_fail('not_signed_in');
  end if;
  select * into invite from team_invites
  where token_hash = team_hash_token(coalesce(invite_token, ''));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into team from orgs where id = invite.org_id and archived_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  caller_email := team_user_email(caller);
  return jsonb_build_object(
    'status', team_invite_status(invite),
    'team_id', team.id,
    'team_name', team.name,
    'role', invite.role,
    'email', invite.email,
    'invited_by_email', team_user_email(invite.invited_by),
    'expires_at', invite.expires_at,
    'email_matches', coalesce(caller_email = invite.email, false),
    'already_member', team_member_role(team.id, caller) is not null
  );
end;
$$;

-- Shared by both ways of answering an invitation (the link, and the in-app
-- list of invitations addressed to the caller's email).
create or replace function team_answer_invite(invite team_invites, accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := team_require_user();
  caller_email text := team_user_email(caller);
  state text;
begin
  if not exists (
    select 1 from orgs where id = invite.org_id and archived_at is null
  ) then
    perform team_fail('invite_not_found');
  end if;
  if caller_email is null or caller_email <> invite.email then
    perform team_fail('invite_email_mismatch');
  end if;

  state := team_invite_status(invite);
  if state = 'accepted' then
    if team_member_role(invite.org_id, caller) is not null then
      return invite.org_id;
    end if;
    perform team_fail('invite_already_accepted');
  elsif state = 'revoked' then
    perform team_fail('invite_revoked');
  elsif state = 'expired' then
    perform team_fail('invite_expired');
  elsif state = 'declined' and not accept then
    return invite.org_id;
  end if;

  if not accept then
    update team_invites set declined_at = now() where id = invite.id;
    perform team_log(invite.org_id, 'invite.declined', invite.email);
    return invite.org_id;
  end if;

  insert into org_members (org_id, user_id, role, invited_by)
  values (invite.org_id, caller, invite.role, invite.invited_by)
  on conflict (org_id, user_id) do nothing;

  update team_invites
  set accepted_at = now(), accepted_by = caller, declined_at = null
  where id = invite.id;

  perform team_log(
    invite.org_id, 'member.joined', invite.email,
    jsonb_build_object('role', invite.role)
  );
  return invite.org_id;
end;
$$;

create or replace function accept_team_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite team_invites;
begin
  perform team_require_user();
  select * into invite from team_invites
  where token_hash = team_hash_token(coalesce(invite_token, ''))
  for update;
  if not found then
    perform team_fail('invite_not_found');
  end if;
  return team_answer_invite(invite, true);
end;
$$;

-- Open invitations addressed to the caller's own email, so someone who never
-- received the link still finds the invitation after signing in.
create or replace function list_my_team_invites()
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  role text,
  invited_by_email text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  anonymous boolean;
begin
  if caller is null then
    perform team_fail('not_signed_in');
  end if;
  select coalesce(u.is_anonymous, false), lower(trim(u.email))
  into anonymous, caller_email
  from auth.users u where u.id = caller;
  if anonymous or caller_email is null then
    return;
  end if;

  return query
    select
      i.id,
      o.id,
      o.name,
      i.role,
      team_user_email(i.invited_by),
      i.created_at,
      i.expires_at
    from team_invites i
    join orgs o on o.id = i.org_id and o.archived_at is null
    where i.email = caller_email
      and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
      and i.expires_at > now()
      and not exists (
        select 1 from org_members m where m.org_id = o.id and m.user_id = caller
      )
    order by i.created_at desc;
end;
$$;

create or replace function respond_to_team_invite(invite_id uuid, accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite team_invites;
begin
  perform team_require_user();
  select * into invite from team_invites where id = invite_id for update;
  if not found then
    perform team_fail('invite_not_found');
  end if;
  return team_answer_invite(invite, coalesce(accept, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------

create or replace function list_team_workspaces(target_org uuid)
returns table (
  id text,
  name text,
  path text,
  backend_id text,
  visibility text,
  my_role text,
  member_count bigint,
  created_by_email text,
  created_at timestamptz,
  updated_at timestamptz
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
      w.id,
      w.name,
      w.path,
      w.backend_id,
      w.visibility,
      workspace_effective_role(w.id),
      (select count(*) from workspace_members x where x.workspace_id = w.id),
      team_user_email(w.created_by),
      w.created_at,
      w.updated_at
    from workspaces w
    where w.org_id = target_org
      and workspace_effective_role(w.id) is not null
    order by w.updated_at desc
    limit 1000;
end;
$$;

create or replace function team_require_workspace(ws_id text, min_role text)
returns workspaces
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  workspace workspaces;
  role_name text;
begin
  perform team_require_user();
  select * into workspace from workspaces where id = ws_id;
  if not found then
    perform team_fail('workspace_not_found');
  end if;
  role_name := workspace_effective_role(ws_id);
  if role_name is null then
    perform team_fail('workspace_not_found');
  end if;
  if team_role_rank(role_name) < team_role_rank(min_role) then
    perform team_fail('not_authorized');
  end if;
  return workspace;
end;
$$;

-- Renames a workspace and/or changes who reaches it. Pass null to leave a
-- field as it is.
create or replace function update_team_workspace(
  ws_id text,
  new_name text default null,
  new_visibility text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace workspaces := team_require_workspace(ws_id, 'admin');
  cleaned text;
begin
  if new_visibility is not null and new_visibility not in ('team', 'restricted') then
    perform team_fail('invalid_visibility');
  end if;
  if new_name is not null then
    cleaned := regexp_replace(trim(new_name), '\s+', ' ', 'g');
    if char_length(cleaned) < 1 or char_length(cleaned) > 80 then
      perform team_fail('invalid_name');
    end if;
  end if;

  update workspaces set
    name = coalesce(cleaned, name),
    visibility = coalesce(new_visibility, visibility)
  where id = ws_id;

  if cleaned is not null and cleaned is distinct from workspace.name then
    perform team_log(
      workspace.org_id, 'workspace.renamed', cleaned,
      jsonb_build_object('from', workspace.name, 'to', cleaned)
    );
  end if;
  if new_visibility is not null and new_visibility <> workspace.visibility then
    perform team_log(
      workspace.org_id, 'workspace.visibility_changed',
      coalesce(cleaned, workspace.name, workspace.path),
      jsonb_build_object('from', workspace.visibility, 'to', new_visibility)
    );
  end if;
end;
$$;

create or replace function list_workspace_members(ws_id text)
returns table (user_id uuid, email text, role text, added_at timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform team_require_workspace(ws_id, 'viewer');
  return query
    select m.user_id, team_user_email(m.user_id), m.role, m.created_at
    from workspace_members m
    where m.workspace_id = ws_id
    order by team_role_rank(m.role) desc, m.created_at asc;
end;
$$;

-- Grants (or changes) one team member's explicit role in a workspace.
create or replace function set_workspace_member(
  ws_id text,
  target_user uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace workspaces := team_require_workspace(ws_id, 'admin');
  existing_role text;
begin
  if new_role not in ('admin', 'member', 'viewer') then
    perform team_fail('invalid_role');
  end if;
  if team_member_role(workspace.org_id, target_user) is null then
    perform team_fail('member_not_found');
  end if;

  select role into existing_role from workspace_members
  where workspace_id = ws_id and user_id = target_user;
  -- The workspace's own owner row is not something a grant overwrites.
  if existing_role = 'owner' then
    perform team_fail('workspace_owner');
  end if;
  if existing_role = new_role then
    return;
  end if;

  insert into workspace_members (workspace_id, user_id, role)
  values (ws_id, target_user, new_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  perform team_log(
    workspace.org_id, 'workspace.member_set', team_user_email(target_user),
    jsonb_build_object(
      'workspace', coalesce(workspace.name, workspace.path), 'role', new_role
    )
  );
end;
$$;

create or replace function remove_workspace_member(ws_id text, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace workspaces := team_require_workspace(ws_id, 'admin');
  existing_role text;
begin
  select role into existing_role from workspace_members
  where workspace_id = ws_id and user_id = target_user;
  if existing_role is null then
    return;
  end if;
  -- Removing the owner's row would leave a workspace anyone in the team could
  -- claim; only a team owner or admin may do it.
  if existing_role = 'owner' and not has_org_role(workspace.org_id, 'admin') then
    perform team_fail('workspace_owner');
  end if;

  delete from workspace_members
  where workspace_id = ws_id and user_id = target_user;

  perform team_log(
    workspace.org_id, 'workspace.member_removed', team_user_email(target_user),
    jsonb_build_object('workspace', coalesce(workspace.name, workspace.path))
  );
end;
$$;

-- Deletes a workspace and everything recorded against it (memory, activity,
-- knowledge, usage). Team owners/admins and the workspace's own owner only.
create or replace function delete_team_workspace(ws_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace workspaces := team_require_workspace(ws_id, 'admin');
begin
  if not has_org_role(workspace.org_id, 'admin')
    and workspace_effective_role(ws_id) <> 'owner' then
    perform team_fail('not_authorized');
  end if;

  delete from workspaces where id = ws_id;
  perform team_log(
    workspace.org_id, 'workspace.deleted', coalesce(workspace.name, workspace.path)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies
--
-- Membership and team rows change only through the functions above. The two
-- bootstrap policies stay so a browser that has not yet picked up
-- `ensure_personal_team` can still create its personal team the old way.
-- ---------------------------------------------------------------------------

drop policy if exists "org admins can update their org" on orgs;
drop policy if exists "org admins can add members" on org_members;
drop policy if exists "org admins can change member roles" on org_members;
drop policy if exists "org admins can remove members" on org_members;

drop policy if exists "creator can self-join their new org as owner" on org_members;
create policy "creator can self-join their new org as owner"
  on org_members for insert
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from orgs o
      where o.id = org_id and o.created_by = (select auth.uid())
    )
  );

-- Read-only team members do not create workspaces in the team.
drop policy if exists "org members can create a workspace in their org" on workspaces;
create policy "org members can create a workspace in their org"
  on workspaces for insert
  with check (has_org_role(org_id, 'member'));

-- Was "any team member can read every workspace row". A restricted workspace
-- is now visible only to the people who can reach it.
drop policy if exists "workspace members can read their workspace" on workspaces;
create policy "workspace members can read their workspace"
  on workspaces for select
  using (
    has_workspace_role(id, 'viewer')
    or (created_by = (select auth.uid()) and is_org_member(org_id))
  );

-- Explicit grants are managed through the functions above. What remains is
-- the creator claiming the workspace they just made.
drop policy if exists "workspace admins can add members" on workspace_members;
drop policy if exists "workspace admins can change member roles" on workspace_members;
drop policy if exists "workspace admins can remove members" on workspace_members;

drop policy if exists "org members can self-join a workspace in their org" on workspace_members;
create policy "org members can self-join a workspace in their org"
  on workspace_members for insert
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and workspace_can_claim_ownership(workspace_id)
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
  client_callable text[] := array[
    'ensure_personal_team', 'resolve_active_team', 'list_my_teams',
    'set_active_team', 'create_team', 'rename_team', 'delete_team',
    'list_team_members', 'update_team_member_role', 'remove_team_member',
    'leave_team', 'transfer_team_ownership', 'create_team_invites',
    'list_team_invites', 'revoke_team_invite', 'regenerate_team_invite',
    'get_team_invite', 'accept_team_invite', 'list_my_team_invites',
    'respond_to_team_invite', 'list_team_workspaces', 'update_team_workspace',
    'list_workspace_members', 'set_workspace_member', 'remove_workspace_member',
    'delete_team_workspace',
    -- Called by RLS policies, which run as the querying user.
    'has_org_role', 'is_org_member', 'is_workspace_member', 'has_workspace_role',
    'workspace_effective_role', 'workspace_can_claim_ownership', 'team_role_rank'
  ];
  internal_only text[] := array[
    'team_fail', 'team_require_user', 'team_user_email', 'team_member_role',
    'team_require_org', 'team_require_role', 'team_log', 'team_clean_name',
    'team_hash_token', 'team_new_token', 'team_invite_status',
    'team_owner_count', 'team_answer_invite', 'team_require_workspace',
    'orgs_before_write', 'workspaces_keep_org', 'org_members_after_delete'
  ];
begin
  for fn in
    select p.oid::regprocedure as signature, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (client_callable || internal_only)
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
    if fn.proname = any (client_callable) then
      execute format('grant execute on function %s to authenticated', fn.signature);
    else
      execute format('revoke execute on function %s from authenticated', fn.signature);
    end if;
  end loop;
end;
$$;

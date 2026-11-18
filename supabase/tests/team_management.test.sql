-- Rule-by-rule test of the team management functions and policies.
--
-- Runs against a real database with three throwaway users, and ALWAYS ends by
-- raising, so the whole thing rolls back: no user, team or invitation it
-- creates survives. Read the result from the error text:
--   TEAM TESTS PASSED (n checks)      -- everything held
--   TEAM TESTS FAILED: ...            -- the checks that did not
--
-- Run it with the Supabase SQL editor or `psql -f`.

do $test$
declare
  a uuid := gen_random_uuid();  -- owner
  b uuid := gen_random_uuid();  -- invited member
  c uuid := gen_random_uuid();  -- outsider, later a viewer
  tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  a_email text;
  b_email text;
  c_email text;
  team uuid;
  personal_a uuid;
  tok text;
  tok2 text;
  inv uuid;
  ws text;
  n integer := 0;
  fails text[] := '{}';
  got text;
  j jsonb;
  r record;
begin
  a_email := 'tm-a-' || tag || '@neodevex.com';
  b_email := 'tm-b-' || tag || '@neodevex.com';
  c_email := 'tm-c-' || tag || '@neodevex.com';
  insert into auth.users (id, email, aud, role)
  values (a, a_email, 'authenticated', 'authenticated'),
         (b, b_email, 'authenticated', 'authenticated'),
         (c, c_email, 'authenticated', 'authenticated');

  -- t_as(user): become that user. t_fail(sql, code): the statement must fail
  -- with exactly that code. t_ok(sql): it must succeed.
  execute $f$
    create function pg_temp.t_as(u uuid) returns void language sql as $$
      select set_config('request.jwt.claims',
        json_build_object('sub', u, 'role', 'authenticated')::text, true);
      select set_config('request.jwt.claim.sub', u::text, true);
    $$;
    create function pg_temp.t_fail(q text, code text) returns text
    language plpgsql as $$
    begin
      begin
        execute q;
      exception when others then
        if sqlerrm = code then return null; end if;
        return format('[%s] expected %s, got %s', q, code, sqlerrm);
      end;
      return format('[%s] expected %s, but it succeeded', q, code);
    end $$;
    create function pg_temp.t_ok(q text) returns text
    language plpgsql as $$
    begin
      execute q;
      return null;
    exception when others then
      return format('[%s] expected success, got %s', q, sqlerrm);
    end $$;
  $f$;

  -- ---- personal team -------------------------------------------------
  perform pg_temp.t_as(a);
  personal_a := ensure_personal_team();
  n := n + 1;
  if ensure_personal_team() <> personal_a then
    fails := fails || 'personal team is not stable across calls';
  end if;
  n := n + 1;
  if (resolve_active_team() ->> 'id')::uuid <> personal_a
     or (resolve_active_team() ->> 'is_personal') <> 'true' then
    fails := fails || 'active team does not default to the personal team';
  end if;
  foreach got in array array[
    pg_temp.t_fail(format('select create_team_invites(%L, array[%L], %L)', personal_a, b_email, 'member'), 'personal_team'),
    pg_temp.t_fail(format('select leave_team(%L)', personal_a), 'personal_team'),
    pg_temp.t_fail(format('select delete_team(%L, %L)', personal_a, 'Personal'), 'personal_team'),
    pg_temp.t_fail(format('select rename_team(%L, %L)', personal_a, 'Mine'), 'personal_team'),
    pg_temp.t_fail(format('select transfer_team_ownership(%L, %L)', personal_a, b), 'personal_team'),
    pg_temp.t_fail('select create_team(''x'')', 'invalid_name'),
    pg_temp.t_fail(format('select create_team(%L)', repeat('y', 61)), 'invalid_name')
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;

  -- ---- create + switch ----------------------------------------------
  team := create_team('  Platform   Team ');
  n := n + 1;
  if (select name from orgs where id = team) <> 'Platform Team' then
    fails := fails || 'team name is not trimmed and collapsed';
  end if;
  perform set_active_team(team);
  n := n + 1;
  if (resolve_active_team() ->> 'id')::uuid <> team
     or (resolve_active_team() ->> 'role') <> 'owner' then
    fails := fails || 'switching the active team did not stick';
  end if;
  -- Code that still resolves "the oldest membership" (deployed Edge
  -- Functions, older frontends) must land on the active team too.
  n := n + 1;
  if (select org_id from org_members where user_id = a order by created_at asc limit 1) <> team then
    fails := fails || 'legacy oldest-membership lookup does not follow the active team';
  end if;
  n := n + 1;
  if exists (select 1 from org_members where user_id = a and joined_at < now() - interval '1 hour') then
    fails := fails || 'switching teams changed a real join date';
  end if;
  perform set_active_team(personal_a);
  n := n + 1;
  if (select org_id from org_members where user_id = a order by created_at asc limit 1) <> personal_a
     or (select count(*) from org_members where user_id = a and created_at <> joined_at) <> 1 then
    fails := fails || 'switching back did not move the resolution marker';
  end if;
  perform set_active_team(team);
  n := n + 1;
  if (select count(*) from list_my_teams()) <> 2 then
    fails := fails || 'list_my_teams should show personal + the new team';
  end if;

  -- An outsider cannot see, switch to or administer the team.
  perform pg_temp.t_as(c);
  foreach got in array array[
    pg_temp.t_fail(format('select set_active_team(%L)', team), 'team_not_found'),
    pg_temp.t_fail(format('select * from list_team_members(%L)', team), 'team_not_found'),
    pg_temp.t_fail(format('select create_team_invites(%L, array[%L], %L)', team, c_email, 'admin'), 'team_not_found'),
    pg_temp.t_fail(format('select rename_team(%L, %L)', team, 'Hijacked'), 'team_not_found'),
    pg_temp.t_fail(format('select delete_team(%L, %L)', team, 'Platform Team'), 'team_not_found'),
    pg_temp.t_fail(format('select * from list_team_workspaces(%L)', team), 'team_not_found')
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;

  -- ---- invitations ---------------------------------------------------
  perform pg_temp.t_as(a);
  foreach got in array array[
    pg_temp.t_fail(format('select create_team_invites(%L, array[%L], %L)', team, b_email, 'owner'), 'invalid_role'),
    pg_temp.t_fail(format('select create_team_invites(%L, array[]::text[], %L)', team, 'member'), 'no_emails')
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;

  n := n + 1;
  select string_agg(x.email || '=' || x.status, ',' order by x.status) into got
  from create_team_invites(
    team,
    array[upper(b_email), '  ' || b_email, 'not-an-email', a_email, 'someone@outside-' || tag || '.example'],
    'member'
  ) x;
  if got <> format('%s=already_member,someone@outside-%s.example=domain_not_allowed,not-an-email=invalid_email,%s=invited',
                   a_email, tag, b_email) then
    fails := fails || ('bulk invite outcomes wrong: ' || coalesce(got, 'null'));
  end if;

  -- Inviting the same address again refreshes the one open invitation.
  select x.token, x.invite_id, x.status into tok, inv, got
  from create_team_invites(team, array[b_email], 'admin') x;
  n := n + 1;
  if got <> 'reinvited' or (select count(*) from team_invites where org_id = team) <> 1 then
    fails := fails || 're-inviting should update the open invitation, not add one';
  end if;
  n := n + 1;
  if exists (select 1 from team_invites where token_hash = tok) then
    fails := fails || 'the raw token must never be stored';
  end if;

  -- The wrong person holding the link cannot use it.
  perform pg_temp.t_as(c);
  j := get_team_invite(tok);
  n := n + 1;
  if j ->> 'status' <> 'pending' or (j ->> 'email_matches')::boolean then
    fails := fails || 'invite preview should be pending and flag the email mismatch';
  end if;
  foreach got in array array[
    pg_temp.t_fail(format('select accept_team_invite(%L)', tok), 'invite_email_mismatch'),
    pg_temp.t_fail(format('select respond_to_team_invite(%L, true)', inv), 'invite_email_mismatch'),
    pg_temp.t_fail('select accept_team_invite(''nope'')', 'invite_not_found'),
    pg_temp.t_fail(format('select revoke_team_invite(%L)', inv), 'team_not_found')
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;
  n := n + 1;
  if get_team_invite('nope') ->> 'status' <> 'not_found' then
    fails := fails || 'unknown token should preview as not_found';
  end if;

  -- A regenerated link replaces the old one.
  perform pg_temp.t_as(a);
  tok2 := regenerate_team_invite(inv);
  perform pg_temp.t_as(b);
  n := n + 1;
  got := pg_temp.t_fail(format('select accept_team_invite(%L)', tok), 'invite_not_found');
  if got is not null then fails := fails || got; end if;

  -- An expired invitation is refused, and shows as expired.
  update team_invites set expires_at = now() - interval '1 minute' where id = inv;
  n := n + 1;
  got := pg_temp.t_fail(format('select accept_team_invite(%L)', tok2), 'invite_expired');
  if got is not null then fails := fails || got; end if;
  n := n + 1;
  if (select count(*) from list_my_team_invites()) <> 0 then
    fails := fails || 'an expired invitation should not be offered in-app';
  end if;
  perform pg_temp.t_as(a);
  n := n + 1;
  if (select status from list_team_invites(team) where id = inv) <> 'expired' then
    fails := fails || 'admin list should show the invitation as expired';
  end if;
  tok := regenerate_team_invite(inv);

  -- The invited person sees it in-app and accepts.
  perform pg_temp.t_as(b);
  n := n + 1;
  if (select count(*) from list_my_team_invites() where team_id = team) <> 1 then
    fails := fails || 'invitee should see the invitation without the link';
  end if;
  n := n + 1;
  if accept_team_invite(tok) <> team or team_member_role(team, b) <> 'admin' then
    fails := fails || 'accepting should add the invitee with the invited role';
  end if;
  n := n + 1;
  if accept_team_invite(tok) <> team then
    fails := fails || 'accepting twice should be harmless';
  end if;
  n := n + 1;
  if (select count(*) from list_my_team_invites()) <> 0 then
    fails := fails || 'an accepted invitation should leave the in-app list';
  end if;
  perform pg_temp.t_as(a);
  foreach got in array array[
    pg_temp.t_fail(format('select revoke_team_invite(%L)', inv), 'invite_already_accepted'),
    pg_temp.t_fail(format('select regenerate_team_invite(%L)', inv), 'invite_already_accepted')
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;

  -- Declining, then revoking.
  select x.token, x.invite_id into tok, inv
  from create_team_invites(team, array[c_email], 'viewer') x;
  perform pg_temp.t_as(c);
  perform respond_to_team_invite(inv, false);
  n := n + 1;
  got := pg_temp.t_ok(format('select respond_to_team_invite(%L, false)', inv));
  if got is not null then fails := fails || got; end if;
  perform pg_temp.t_as(a);
  n := n + 1;
  got := pg_temp.t_fail(format('select regenerate_team_invite(%L)', inv), 'invite_declined');
  if got is not null then fails := fails || got; end if;
  select x.token, x.invite_id into tok, inv
  from create_team_invites(team, array[c_email], 'viewer') x;
  perform revoke_team_invite(inv);
  perform pg_temp.t_as(c);
  n := n + 1;
  got := pg_temp.t_fail(format('select accept_team_invite(%L)', tok), 'invite_revoked');
  if got is not null then fails := fails || got; end if;
  perform pg_temp.t_as(a);
  select x.token into tok from create_team_invites(team, array[c_email], 'viewer') x;
  perform pg_temp.t_as(c);
  perform accept_team_invite(tok);

  -- ---- roles ---------------------------------------------------------
  -- b is an admin, c a viewer, a the only owner.
  perform pg_temp.t_as(b);
  foreach got in array array[
    pg_temp.t_fail(format('select update_team_member_role(%L, %L, %L)', team, c, 'owner'), 'owner_required'),
    pg_temp.t_fail(format('select update_team_member_role(%L, %L, %L)', team, a, 'member'), 'owner_required'),
    pg_temp.t_fail(format('select update_team_member_role(%L, %L, %L)', team, b, 'owner'), 'owner_required'),
    pg_temp.t_fail(format('select remove_team_member(%L, %L)', team, a), 'owner_required'),
    pg_temp.t_fail(format('select remove_team_member(%L, %L)', team, b), 'use_leave'),
    pg_temp.t_fail(format('select delete_team(%L, %L)', team, 'Platform Team'), 'not_authorized'),
    pg_temp.t_fail(format('select transfer_team_ownership(%L, %L)', team, b), 'not_authorized'),
    pg_temp.t_fail(format('select update_team_member_role(%L, %L, %L)', team, c, 'boss'), 'invalid_role'),
    pg_temp.t_ok(format('select update_team_member_role(%L, %L, %L)', team, c, 'member')),
    pg_temp.t_ok(format('select rename_team(%L, %L)', team, 'Platform'))
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;

  perform pg_temp.t_as(c);  -- now a plain member
  foreach got in array array[
    pg_temp.t_fail(format('select update_team_member_role(%L, %L, %L)', team, c, 'admin'), 'not_authorized'),
    pg_temp.t_fail(format('select remove_team_member(%L, %L)', team, b), 'not_authorized'),
    pg_temp.t_fail(format('select create_team_invites(%L, array[%L], %L)', team, a_email, 'member'), 'not_authorized'),
    pg_temp.t_fail(format('select * from list_team_invites(%L)', team), 'not_authorized'),
    pg_temp.t_fail(format('select rename_team(%L, %L)', team, 'Nope'), 'not_authorized'),
    pg_temp.t_ok(format('select * from list_team_members(%L)', team))
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;

  perform pg_temp.t_as(a);  -- the only owner
  foreach got in array array[
    pg_temp.t_fail(format('select leave_team(%L)', team), 'last_owner'),
    pg_temp.t_fail(format('select update_team_member_role(%L, %L, %L)', team, a, 'admin'), 'last_owner'),
    pg_temp.t_fail(format('select transfer_team_ownership(%L, %L)', team, a), 'invalid_target'),
    pg_temp.t_fail(format('select transfer_team_ownership(%L, %L)', team, gen_random_uuid()), 'member_not_found'),
    pg_temp.t_fail(format('select delete_team(%L, %L)', team, 'platform'), 'confirmation_mismatch')
  ] loop
    n := n + 1;
    if got is not null then fails := fails || got; end if;
  end loop;

  -- ---- workspaces ----------------------------------------------------
  ws := 'ws_test_' || tag;
  perform pg_temp.t_as(c);
  insert into workspaces (id, org_id, backend_id, path, name, created_by)
  values (ws, team, 'default-local', '/srv/demo', 'demo', c);
  insert into workspace_members (workspace_id, user_id, role) values (ws, c, 'owner');

  perform pg_temp.t_as(b);  -- team admin: administers every workspace
  n := n + 1;
  if workspace_effective_role(ws) <> 'admin' then
    fails := fails || 'a team admin should administer every team workspace';
  end if;
  perform update_team_member_role(team, c, 'viewer');
  perform update_team_member_role(team, c, 'member');

  -- A plain member reaches it through the team while it is shared...
  perform pg_temp.t_as(a);
  perform update_team_member_role(team, b, 'member');
  perform pg_temp.t_as(b);
  n := n + 1;
  if workspace_effective_role(ws) <> 'member' then
    fails := fails || 'a member should reach a team-visible workspace as member';
  end if;
  n := n + 1;
  got := pg_temp.t_fail(format('select update_team_workspace(%L, null, %L)', ws, 'restricted'), 'not_authorized');
  if got is not null then fails := fails || got; end if;

  -- ...and loses it once it is restricted.
  perform pg_temp.t_as(c);
  perform update_team_workspace(ws, 'Demo app', 'restricted');
  perform pg_temp.t_as(b);
  n := n + 1;
  if workspace_effective_role(ws) is not null or is_workspace_member(ws) then
    fails := fails || 'a restricted workspace must be closed to ungranted members';
  end if;
  n := n + 1;
  if (select count(*) from list_team_workspaces(team)) <> 0 then
    fails := fails || 'a restricted workspace must not be listed to ungranted members';
  end if;
  n := n + 1;
  got := pg_temp.t_fail(format('select * from list_workspace_members(%L)', ws), 'workspace_not_found');
  if got is not null then fails := fails || got; end if;

  -- Row level security agrees with the functions.
  set local role authenticated;
  n := n + 1;
  if exists (select 1 from workspaces where id = ws) then
    fails := fails || 'RLS: ungranted member can read a restricted workspace row';
  end if;
  n := n + 1;
  got := pg_temp.t_fail(
    format('insert into workspace_members (workspace_id, user_id, role) values (%L, %L, %L)', ws, b, 'owner'),
    'new row violates row-level security policy for table "workspace_members"');
  if got is not null then fails := fails || got; end if;
  n := n + 1;
  got := pg_temp.t_fail(
    format('insert into org_members (org_id, user_id, role) values (%L, %L, %L)', personal_a, b, 'owner'),
    'new row violates row-level security policy for table "org_members"');
  if got is not null then fails := fails || got; end if;
  update org_members set role = 'owner' where org_id = team and user_id = b;
  update orgs set name = 'Pwned' where id = team;
  delete from org_members where org_id = team and user_id = a;
  reset role;
  n := n + 1;
  if team_member_role(team, b) <> 'member' or team_member_role(team, a) <> 'owner'
     or (select name from orgs where id = team) <> 'Platform' then
    fails := fails || 'RLS: a member changed roles, the name or membership directly';
  end if;

  -- An explicit grant opens the restricted workspace to one person.
  perform pg_temp.t_as(c);
  perform set_workspace_member(ws, b, 'viewer');
  n := n + 1;
  got := pg_temp.t_fail(format('select set_workspace_member(%L, %L, %L)', ws, c, 'viewer'), 'workspace_owner');
  if got is not null then fails := fails || got; end if;
  n := n + 1;
  got := pg_temp.t_fail(format('select set_workspace_member(%L, %L, %L)', ws, gen_random_uuid(), 'viewer'), 'member_not_found');
  if got is not null then fails := fails || got; end if;
  perform pg_temp.t_as(b);
  n := n + 1;
  if workspace_effective_role(ws) <> 'viewer' or has_workspace_role(ws, 'member') then
    fails := fails || 'an explicit viewer grant should give read-only access';
  end if;

  -- A workspace keeps its team even when an upsert names another one.
  perform pg_temp.t_as(c);
  update workspaces set org_id = personal_a where id = ws;
  n := n + 1;
  if (select org_id from workspaces where id = ws) <> team then
    fails := fails || 'a workspace changed team on update';
  end if;

  -- Removing a member drops their grants and their active-team choice.
  perform pg_temp.t_as(b);
  perform set_active_team(team);
  perform pg_temp.t_as(a);
  perform remove_team_member(team, b);
  n := n + 1;
  if exists (select 1 from workspace_members where workspace_id = ws and user_id = b) then
    fails := fails || 'removed member kept a workspace grant';
  end if;
  perform pg_temp.t_as(b);
  n := n + 1;
  if (resolve_active_team() ->> 'is_personal') <> 'true' then
    fails := fails || 'removed member should fall back to their personal team';
  end if;
  n := n + 1;
  if workspace_effective_role(ws) is not null then
    fails := fails || 'removed member can still reach a team workspace';
  end if;
  n := n + 1;
  if (select o.is_personal from org_members m join orgs o on o.id = m.org_id
      where m.user_id = b order by m.created_at asc limit 1) is not true then
    fails := fails || 'legacy lookup for a removed member should return their personal team';
  end if;

  -- ---- ownership transfer, leaving, deleting -------------------------
  perform pg_temp.t_as(a);
  perform transfer_team_ownership(team, c);
  n := n + 1;
  if team_member_role(team, c) <> 'owner' or team_member_role(team, a) <> 'admin' then
    fails := fails || 'ownership transfer should swap owner and admin';
  end if;
  n := n + 1;
  got := pg_temp.t_ok(format('select leave_team(%L)', team));
  if got is not null then fails := fails || got; end if;
  -- Checked before anything re-resolves: the trigger alone must fix it.
  n := n + 1;
  if (select org_id from org_members where user_id = a order by created_at asc limit 1) <> personal_a then
    fails := fails || 'legacy lookup should return personal right after leaving';
  end if;
  n := n + 1;
  if (resolve_active_team() ->> 'id')::uuid <> personal_a then
    fails := fails || 'leaving the active team should fall back to personal';
  end if;

  perform pg_temp.t_as(c);
  n := n + 1;
  if (select count(*) from team_audit_log where org_id = team) < 12 then
    fails := fails || 'audit log is missing entries';
  end if;
  n := n + 1;
  got := pg_temp.t_ok(format('select delete_team_workspace(%L)', ws));
  if got is not null then fails := fails || got; end if;
  n := n + 1;
  got := pg_temp.t_ok(format('select delete_team(%L, %L)', team, 'Platform'));
  if got is not null then fails := fails || got; end if;
  n := n + 1;
  if exists (select 1 from orgs where id = team)
     or exists (select 1 from team_invites where org_id = team) then
    fails := fails || 'deleting a team left rows behind';
  end if;

  if array_length(fails, 1) is null then
    raise exception 'TEAM TESTS PASSED (% checks)', n;
  end if;
  raise exception 'TEAM TESTS FAILED (% of % checks): %',
    array_length(fails, 1), n, array_to_string(fails, ' || ');
end
$test$;

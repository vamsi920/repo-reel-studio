-- SECURITY DEFINER is required here specifically because the function needs
-- to read workspace_members to answer "is this user a member," and the
-- caller's own RLS on workspace_members would otherwise create a circular
-- dependency. Both are `stable` so the planner can cache the result within a
-- statement. `search_path` is pinned to `public` on both -- an unpinned
-- search_path on a SECURITY DEFINER function is the most common Postgres RLS
-- privilege-escalation footgun.

create or replace function is_workspace_member(ws_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

create or replace function has_workspace_role(ws_id text, min_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
      and (
        case min_role
          when 'viewer' then role in ('viewer', 'member', 'admin', 'owner')
          when 'member' then role in ('member', 'admin', 'owner')
          when 'admin' then role in ('admin', 'owner')
          when 'owner' then role = 'owner'
          else false
        end
      )
  );
$$;

create or replace function is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = target_org_id and user_id = auth.uid()
  );
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
      and (
        case min_role
          when 'member' then role in ('member', 'admin', 'owner')
          when 'admin' then role in ('admin', 'owner')
          when 'owner' then role = 'owner'
          else false
        end
      )
  );
$$;

-- The environment profile: what this install decided about itself.
--
-- Holds no credentials -- only which provider each capability points at,
-- network posture, and policy. That is why, unlike `connections`, org admins
-- can write it directly from the browser: there is nothing here to leak, and
-- making them round-trip through an Edge Function to toggle a deployment mode
-- would be ceremony without a security benefit.

create table if not exists environment_profiles (
  org_id uuid primary key references orgs (id) on delete cascade,
  doc jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table environment_profiles enable row level security;

create policy "org members read environment profile"
  on environment_profiles for select
  using (is_org_member(org_id));

create policy "org admins insert environment profile"
  on environment_profiles for insert
  with check (has_org_role(org_id, 'admin'));

create policy "org admins update environment profile"
  on environment_profiles for update
  using (has_org_role(org_id, 'admin'))
  with check (has_org_role(org_id, 'admin'));

-- Append-only history. Onboarding runs over days and across people; without
-- this, "who changed the model provider on Tuesday" is unanswerable.
create table if not exists environment_profile_revisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  revision integer not null,
  doc jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists environment_profile_revisions_org_idx
  on environment_profile_revisions (org_id, revision desc);

alter table environment_profile_revisions enable row level security;

create policy "org members read profile revisions"
  on environment_profile_revisions for select
  using (is_org_member(org_id));

-- Written by the trigger below (which runs as the table owner), never by a
-- client, so there is no insert policy.

create or replace function record_environment_profile_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.revision := coalesce(old.revision, 0) + 1;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), old.updated_by);

  insert into environment_profile_revisions (org_id, revision, doc, changed_by)
  values (new.org_id, new.revision, new.doc, new.updated_by);

  return new;
end;
$$;

revoke execute on function record_environment_profile_revision() from public;
revoke execute on function record_environment_profile_revision() from anon, authenticated;

drop trigger if exists environment_profile_revision on environment_profiles;
create trigger environment_profile_revision
  before insert or update of doc on environment_profiles
  for each row
  execute function record_environment_profile_revision();

-- What the onboarding agent learns about the company it is being installed
-- into.
--
-- Deliberately NOT a section inside `environment_profiles`, for two reasons.
-- First, `environment_profiles` is admin-write (`has_org_role(...,'admin')`),
-- but the person who actually knows how the company builds software is very
-- often a plain engineer, and forcing an admin to sit through the interview
-- would defeat the point. Second, this is product knowledge rather than
-- deployment configuration: later agents should be able to read "they use
-- trunk-based development and squash merges" without parsing a network
-- posture out of the same document.

create table if not exists company_profiles (
  org_id uuid primary key references orgs (id) on delete cascade,
  doc jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table company_profiles enable row level security;

create policy "org members read company profile"
  on company_profiles for select
  using (is_org_member(org_id));

-- Members write, unlike the environment profile. The document holds no
-- credentials -- only facts a colleague would tell you out loud -- so the
-- restriction that protects the environment profile would only get in the way
-- here.
create policy "org members insert company profile"
  on company_profiles for insert
  with check (has_org_role(org_id, 'member'));

create policy "org members update company profile"
  on company_profiles for update
  using (has_org_role(org_id, 'member'))
  with check (has_org_role(org_id, 'member'));

-- Append-only history. Onboarding is a conversation that runs over days and
-- across people; without this, "who told us we were on GitLab" is
-- unanswerable, and a fact silently overwritten is worse than no fact.
create table if not exists company_profile_revisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  revision integer not null,
  doc jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists company_profile_revisions_org_idx
  on company_profile_revisions (org_id, revision desc);

alter table company_profile_revisions enable row level security;

create policy "org members read company profile revisions"
  on company_profile_revisions for select
  using (is_org_member(org_id));

-- Written by the trigger below (which runs as the table owner), never by a
-- client, so there is no insert policy.

create or replace function record_company_profile_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.revision := coalesce(old.revision, 0) + 1;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), old.updated_by);

  insert into company_profile_revisions (org_id, revision, doc, changed_by)
  values (new.org_id, new.revision, new.doc, new.updated_by);

  return new;
end;
$$;

revoke execute on function record_company_profile_revision() from public;
revoke execute on function record_company_profile_revision() from anon, authenticated;

drop trigger if exists company_profile_revision on company_profiles;
create trigger company_profile_revision
  before insert or update of doc on company_profiles
  for each row
  execute function record_company_profile_revision();

-- The live onboarding conversation for an org.
--
-- Kept server-side rather than in the browser because all three things that
-- routinely happen during onboarding destroy browser state: the OAuth redirect
-- throws the page away mid-flow, the work spans more than one sitting, and the
-- person who starts it is often not the person who finishes it.
create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  conversation_id text not null,
  started_by uuid references auth.users (id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned')),
  phase text not null default 'discovery',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live session per org. Two colleagues opening the studio should land in
-- the same conversation, not fork the company's onboarding into two
-- transcripts that each know half the story.
create unique index if not exists onboarding_sessions_one_active
  on onboarding_sessions (org_id)
  where status = 'active';

alter table onboarding_sessions enable row level security;

create policy "org members read onboarding sessions"
  on onboarding_sessions for select
  using (is_org_member(org_id));

create policy "org members start onboarding sessions"
  on onboarding_sessions for insert
  with check (has_org_role(org_id, 'member'));

create policy "org members update onboarding sessions"
  on onboarding_sessions for update
  using (has_org_role(org_id, 'member'))
  with check (has_org_role(org_id, 'member'));

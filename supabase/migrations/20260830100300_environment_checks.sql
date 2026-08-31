-- The probe ledger and the onboarding task list.

-- Every check that has ever run, with the vantage it ran from. Onboarding a
-- company is an argument about evidence -- "we allowed that host last week",
-- "it worked from my laptop" -- and this is the record that settles it.
create table if not exists environment_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  kind text not null,
  target text not null,
  -- browser | edge | runtime. A result without this is a claim without a
  -- source: the platform's egress says nothing about the customer's network.
  vantage text not null check (vantage in ('browser', 'edge', 'runtime')),
  ok boolean not null,
  latency_ms integer,
  checks jsonb not null default '[]'::jsonb,
  remediation jsonb,
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists environment_checks_org_created_idx
  on environment_checks (org_id, created_at desc);
create index if not exists environment_checks_org_kind_idx
  on environment_checks (org_id, kind, created_at desc);

alter table environment_checks enable row level security;

create policy "org members read environment checks"
  on environment_checks for select
  using (is_org_member(org_id));

-- Written only by service-role Edge Functions and the runtime preflight, so
-- the ledger cannot be forged from a browser.

-- Requirement items someone has taken ownership of. This is what turns a
-- readiness screen into something that survives being handed between two
-- people over three days.
create table if not exists environment_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs (id) on delete cascade,
  -- Matches ReadinessItem.id, derived from the requirement node.
  requirement_id text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done')),
  assignee_email text,
  note text,
  due_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, requirement_id)
);

alter table environment_onboarding_tasks enable row level security;

-- Client-writable, unlike the tables above: these rows hold no credentials,
-- and requiring an Edge Function round-trip to tick a checkbox would make the
-- list annoying enough that nobody would keep it current.
create policy "org members read onboarding tasks"
  on environment_onboarding_tasks for select
  using (is_org_member(org_id));

create policy "org members write onboarding tasks"
  on environment_onboarding_tasks for insert
  with check (has_org_role(org_id, 'member'));

create policy "org members update onboarding tasks"
  on environment_onboarding_tasks for update
  using (has_org_role(org_id, 'member'))
  with check (has_org_role(org_id, 'member'));

create policy "org admins delete onboarding tasks"
  on environment_onboarding_tasks for delete
  using (has_org_role(org_id, 'admin'));

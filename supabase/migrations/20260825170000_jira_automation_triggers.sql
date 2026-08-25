-- Jira instant automation triggers: a webhook registration (one per user,
-- ties our Jira connection to one automation-service custom webhook + one
-- Atlassian dynamic webhook) plus the individual trigger configs users
-- create against it (project/label/repo -> automation).

create table jira_webhook_registrations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- automation-service's own org id (returned by POST /v1/webhooks), needed
  -- to build the event-forwarding URL {base}/v1/events/{org_id}/jira.
  automation_org_id text not null,
  automation_webhook_id text not null,
  encrypted_webhook_secret bytea not null,
  signature_header text not null,
  atlassian_webhook_id text not null,
  cloud_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table jira_webhook_registrations enable row level security;

create policy "users read their own jira webhook registration"
  on jira_webhook_registrations for select
  using (user_id = (select auth.uid()));

-- No write policy: registration/rotation/deletion only ever happens through
-- jira-webhook-register / jira-disconnect (service-role Edge Functions),
-- same boundary as jira_connections.

-- One row per configured trigger. Schema supports many per user even though
-- the UI starts with one -- no migration needed when that changes. Holds no
-- secrets, so (unlike the tables above) it's safe for the browser to manage
-- directly.
create table jira_automation_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_key text not null,
  label_filter text,
  ready_status text not null default 'Ready for Development',
  repository text not null,
  branch text,
  -- The automation-service's own Automation.id, once created.
  automation_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table jira_automation_triggers enable row level security;

create policy "users manage their own jira automation triggers"
  on jira_automation_triggers for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index jira_automation_triggers_user_id_idx
  on jira_automation_triggers (user_id);

-- Schema-only stubs for product areas with no UI in the current app yet
-- (SME, Requirements, durable Video-KT artifacts -- they only exist in the
-- retired legacy/ app today). Tables + RLS ship now so a future feature PR is
-- additive UI wiring, not a schema-plus-security retrofit.

create table sme_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  repository_id uuid references repositories(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  status text,
  findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table sme_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  title text not null,
  storage_path text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table requirements_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  status text,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table requirements_documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references requirements_sessions(id) on delete cascade,
  title text,
  content_markdown text,
  created_at timestamptz not null default now()
);

create table kt_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  repository_id uuid references repositories(id) on delete set null,
  manifest jsonb,
  storage_path text,
  created_at timestamptz not null default now()
);

-- Replaces the hardcoded @neodevex.com signup trigger from
-- 20260824120000_restrict_signup_domain.sql with a data-driven allowlist.
--
-- The hardcoded regex made every customer install impossible: a company
-- onboarding NeoDevEx cannot create a single account, and the failure
-- surfaces as an opaque 500 from Supabase Auth. The domain set now lives in
-- a table the Environment Onboarding module owns.
--
-- Empty table = allow everything. That is deliberate: a fresh install has no
-- rows, so signup works out of the box, and a deployment opts in to
-- restriction by adding rows. The migration seeds neodevex.com so this
-- project's behaviour is byte-identical to the previous trigger on day one.

create table if not exists signup_domain_allowlist (
  domain text primary key,
  -- Nullable: a deployment-wide rule has no owning org. Org-scoped rows
  -- exist so a future multi-tenant install can delegate the list per tenant.
  org_id uuid references orgs (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table signup_domain_allowlist enable row level security;

-- Readable by any signed-in user (the login screen mirrors the rule for UX,
-- see isAllowedSignupEmail in src/lib/data-platform/auth-flow.ts). Writes go
-- through a service-role Edge Function, same as every other config table.
create policy "authenticated read signup domain allowlist"
  on signup_domain_allowlist for select
  to authenticated
  using (true);

-- The trigger runs as the auth admin before any session exists, so it must
-- not depend on RLS: security definer with a pinned search_path, matching
-- the function it replaces.
create or replace function enforce_signup_domain_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowlist_size integer;
  email_domain text;
begin
  if new.email is null then
    return new;
  end if;

  select count(*) into allowlist_size from signup_domain_allowlist;
  if allowlist_size = 0 then
    return new;
  end if;

  email_domain := lower(split_part(new.email, '@', 2));
  if email_domain = '' then
    raise exception 'Sign-up requires a valid email address'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from signup_domain_allowlist where lower(domain) = email_domain
  ) then
    raise exception 'Sign-up is not permitted for the % domain', email_domain
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function enforce_signup_domain_allowlist() from public;
revoke execute on function enforce_signup_domain_allowlist() from anon, authenticated;

-- Fires on insert (signInWithOtp) and on update of email (the anonymous
-- session upgrade path, supabase.auth.updateUser({email}), is an UPDATE --
-- without this branch the check is silently bypassable, as documented on the
-- trigger being replaced).
drop trigger if exists enforce_neodevex_email_domain on auth.users;
drop trigger if exists enforce_signup_domain_allowlist on auth.users;
create trigger enforce_signup_domain_allowlist
  before insert or update of email on auth.users
  for each row
  execute function enforce_signup_domain_allowlist();

drop function if exists reject_non_neodevex_email();

-- Preserve current production behaviour. A customer install removes this row
-- (or adds their own) through the Environment Onboarding policy settings.
insert into signup_domain_allowlist (domain)
values ('neodevex.com')
on conflict (domain) do nothing;

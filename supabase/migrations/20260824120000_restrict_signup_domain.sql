-- Restrict account creation to @neodevex.com addresses. The client-side
-- check (isAllowedSignupEmail in src/lib/data-platform/auth-flow.ts) is a
-- UX nicety only -- this trigger is the actual boundary, since anyone can
-- call the Supabase Auth API directly and skip the client entirely.
--
-- Fires on both insert (new signups via signInWithOtp) and update of email
-- (the anonymous-session upgrade path, supabase.auth.updateUser({email}),
-- is an UPDATE on auth.users, not an INSERT -- without the update branch
-- the domain check would be silently bypassable through that path).
create or replace function reject_non_neodevex_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and new.email !~* '^[^@]+@neodevex\.com$' then
    raise exception 'Sign-up is restricted to @neodevex.com email addresses'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_neodevex_email_domain on auth.users;
create trigger enforce_neodevex_email_domain
  before insert or update of email on auth.users
  for each row
  execute function reject_non_neodevex_email();

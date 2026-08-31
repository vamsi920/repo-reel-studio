-- The daily Jira webhook renewal job hardcoded this project's Supabase
-- functions URL, so a customer install silently renewed OUR webhooks (or,
-- more likely, got a 401 every night and let their Jira webhooks expire
-- after 30 days with no signal).
--
-- The URL now comes from a database setting. current_setting(..., true)
-- returns null rather than raising when unset, and the coalesce falls back
-- to the previously-hardcoded value so this project keeps working with no
-- provisioning step. A fresh install sets:
--
--   alter database postgres set app.functions_base_url =
--     'https://<project-ref>.supabase.co/functions/v1';
--
-- The environment-probe Edge Function's `deployment-defects` check reports
-- when the setting is unset and the fallback is in play.

select cron.unschedule('jira-webhook-renew-daily')
where exists (
  select 1 from cron.job where jobname = 'jira-webhook-renew-daily'
);

select cron.schedule(
  'jira-webhook-renew-daily',
  '17 3 * * *', -- once a day, off the hour to avoid the cron thundering herd
  $$
  select net.http_post(
    url := coalesce(
      nullif(current_setting('app.functions_base_url', true), ''),
      'https://hyirnyyqwyvplwvuekda.supabase.co/functions/v1'
    ) || '/jira-webhook-renew',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'jira_webhook_renew_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

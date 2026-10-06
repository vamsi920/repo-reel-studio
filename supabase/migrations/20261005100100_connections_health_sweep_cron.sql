-- Hourly connection health sweep: refreshes OAuth tokens before they lapse and
-- re-probes stale connections so a dead token surfaces as a Reconnect prompt
-- instead of a silent "connected". Same URL setting and shared secret as the
-- Jira webhook renewal job (see 20260830090100_jira_cron_url_from_setting.sql).

select cron.unschedule('connections-health-sweep-hourly')
where exists (
  select 1 from cron.job where jobname = 'connections-health-sweep-hourly'
);

select cron.schedule(
  'connections-health-sweep-hourly',
  '41 * * * *',
  $$
  select net.http_post(
    url := coalesce(
      nullif(current_setting('app.functions_base_url', true), ''),
      'https://hyirnyyqwyvplwvuekda.supabase.co/functions/v1'
    ) || '/connections-health-sweep',
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

-- Daily renewal of Jira dynamic webhooks (Atlassian expires them after 30
-- days with no other warning). pg_net makes the HTTP call; the cron secret
-- lives in Vault rather than inline in this migration since migrations are
-- readable by anyone with repo access.

create extension if not exists pg_net;

select vault.create_secret(
  'REPLACE_AT_APPLY_TIME',
  'jira_webhook_renew_cron_secret'
);

select cron.schedule(
  'jira-webhook-renew-daily',
  '17 3 * * *', -- once a day, off the hour to avoid the cron thundering herd
  $$
  select net.http_post(
    url := 'https://hyirnyyqwyvplwvuekda.supabase.co/functions/v1/jira-webhook-renew',
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

-- Remember which origin an OAuth flow started from so the callback can send the
-- user back there (localhost, Docker, the desktop app, a preview deploy)
-- instead of always to production. Null means "use the deployment default".
alter table oauth_states
  add column if not exists app_origin text;

alter table github_oauth_state
  add column if not exists app_origin text;
alter table jira_oauth_state
  add column if not exists app_origin text;

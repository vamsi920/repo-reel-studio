-- The browser records live conversation spend straight into usage_events
-- (src/lib/real-usage/track-usage.ts -> usageRepository.recordEvent) with the
-- signed-in member's JWT. 20260819201522 only gave members a select policy, so
-- every one of those inserts was refused by RLS (42501 -> HTTP 403) and the
-- "durable, cross-tab" half of the Usage dashboard never reached the database.
--
-- Members may append rows for their own workspace, but only conversation
-- spend: the other sources (agentops, automation_run, memory_savings) stay
-- reserved for trusted writers using the service role, which bypasses RLS.
create policy "members can record conversation usage"
  on usage_events for insert
  to authenticated
  with check (is_workspace_member(workspace_id) and source = 'conversation');

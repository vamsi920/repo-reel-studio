-- Additive follow-up to 20260819201308_knowledge_codegraph.sql:
-- explicit page linkage for diagrams (today's schema only referenced the
-- generation, with no way to tell which page a diagram belongs to), and a
-- branch column since the app's repositoryId embeds branch but
-- `repositories` has no branch column captured per-generation.
--
-- Recovered from production's migration history (it was applied there but
-- never committed). `if not exists` so it is safe on any database.

alter table knowledge_diagrams add column if not exists page_id text;
alter table knowledge_generations add column if not exists branch text;

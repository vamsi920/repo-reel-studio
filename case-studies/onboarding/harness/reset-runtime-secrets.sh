#!/bin/bash
# Deletes the connection secrets the study synced into the isolated
# agent-server (names only are listed; values are never printed).
KEY=$(cat ~/.openhands/agent-canvas/api-key.txt)
for n in $(curl -s localhost:18000/api/settings/secrets -H "X-Session-API-Key: $KEY" \
  | python3 -c "import json,sys;print(' '.join(s['name'] for s in json.load(sys.stdin)['secrets'] if s['name'].startswith(('GITLAB_SELF','JIRA_DC','GITHUB_','LINEAR','VERCEL','OPENAI'))))"); do
  curl -s -o /dev/null -w "deleted $n %{http_code}\n" -X DELETE "localhost:18000/api/settings/secrets/$n" -H "X-Session-API-Key: $KEY"
done

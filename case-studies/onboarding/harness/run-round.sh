#!/bin/bash
# Runs the onboarding study scenarios in order against the isolated stack.
#   case-studies/onboarding/harness/run-round.sh S1-northwind-bank S5-return-visit ...
# Traces stay off: they would record the login form fill.
cd "$(dirname "$0")/../../.." || exit 2
# The test account's org. S5 is the return visit and keeps what S1 left.
ORG_ID=${STUDY_ORG_ID:-df390035-f453-463b-9eff-8ec52fffcce4}
for s in "$@"; do
  if [ "$s" != "S5-return-visit" ]; then
    node case-studies/onboarding/harness/reset-org.mjs "$ORG_ID"
    case-studies/onboarding/harness/reset-runtime-secrets.sh
  fi
  rm -rf test-results-auth
  ONBOARDING_STUDY=1 STUDY_SCENARIO=$s E2E_BASE_URL=http://localhost:8000 \
    node --env-file-if-exists=.env.test.local node_modules/.bin/playwright test \
    --config=playwright.auth.config.ts onboarding-agent-study --trace=off \
    --global-timeout=1500000 > "case-studies/onboarding/out/$s-run.log" 2>&1
  echo "$s exit $?"
done
rm -rf test-results-auth

# Proactive discovery dry-run fixture

Deterministic local repo for discovery **without** GitHub clone/sync or OpenDevin execution.

## What it includes

| Signal | Path | Expected behavior |
|--------|------|-------------------|
| TODO marker | `src/util/helpers.ts` | `improvement` candidate, selectable |
| Central hub, no tests | `src/core/index.ts` + importers | Centrality / validation-coverage candidate |
| Package scripts | `package.json` | Strong/moderate validation profile (`test`, `lint`, `build`) |
| Sensitive path | `src/auth/session.ts`, `config/secrets/vault.ts` | High-risk scoring; policy-sensitive paths |

## Commands

Smoke validator (CI-friendly):

```bash
cd server && python3 validate_proactive_discovery_fixture.py
```

Unit tests:

```bash
cd server && python3 -m unittest tests.test_proactive_discovery_fixture -v
```

CLI (optional — keeps workspace when `--keep` set):

```bash
cd server && python3 proactive_discovery_fixture.py --target 3
cd server && python3 proactive_discovery_fixture.py --keep /tmp/proactive-fixture-repo
```

## API surface

```python
from proactive_discovery_fixture import (
    run_discovery_dry_run,
    assert_discovery_fixture_expectations,
    materialize_discovery_fixture_workspace,
)
```

`run_discovery_dry_run()` calls `discover_candidates` + `select_candidates` only.

## Not in scope

- No `dispatch_daily`, no `materialize_candidate_run`, no `execute_candidate_run`
- No network or `GITHUB_TOKEN`

Use full dispatch/cron flows only after this fixture passes.

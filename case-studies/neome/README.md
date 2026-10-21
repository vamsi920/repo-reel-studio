# Neo ME end-to-end study

Three real applications of rising difficulty were migrated with Neo ME
(`/modernize`) and each result was checked by an independent black-box
differential harness in `bench/` that knows nothing about Neo ME:

- `bench/flaskr_diff.py <legacy> <new> [--seeded user:pass]` -- the Flask
  tutorial blog (Flask + SQLite + Jinja): replays the same browser-like
  session against both apps and compares status, redirect target, form
  fields and the visible text of every page.
- `bench/conduit_diff.py <legacy> <new> [--seeded email:pass]` -- the
  Conduit JSON API (RealWorld spec, Django 1.x): 56 requests, JSON bodies
  compared exactly after normalising JWTs, timestamps and slug suffixes.
- `bench/conduit_ui_diff.mjs <legacy> <new>` -- the Conduit AngularJS
  frontend: a 32-checkpoint Playwright journey (sign up, publish, comment,
  follow, favorite, edit, delete) driven through both UIs with role and
  placeholder locators only; route and visible text compared at every step.

Each checker was first run legacy-vs-legacy (two fresh instances) and had to
report 100% identical before it was used on a migration.

Sample applications: `pallets/flask` `examples/tutorial`,
`gothinkster/django-realworld-example-app`,
`gothinkster/angularjs-realworld-example-app` (pinned to `angular@1.5.11`;
served with a local copy of the Django API because the public demo API is
gone). Results and the write-up: `../site/neome/`.

# Neo ME end-to-end results

## flaskr (Flask+SQLite+Jinja -> Express+Nunjucks), run 1 (before fixes)
- Neo ME claimed: 11/11 parity, done. Cost $3.73, 117 model calls.
- Independent differential check: 35/37 status+redirect, 9/37 visible text.
- Legacy users locked out (werkzeug scrypt hashes unsupported), dates show time,
  403 blank, 404/405 pages differ, GET /<id>/delete 404 not 405.

## flaskr run 2 (brief v2, stopped at characterize)
- Suite gained a legacy-data case, but its 'differential' test compared only status+Location on 3 requests.
- Led to: Neo ME-owned replay harness (.neome/replay.mjs) + studio reads the report itself.

## flaskr run 3 (harness v1, stopped at $35 while thrashing on DB resets)
- Independent check (redirect bodies ignored): see below
- run 3 measured independently: 35/37 user-visible identical; legacy logins work; remaining: same-second post order, GET /<id>/delete 405; cost $35 (thrash on DB resets)

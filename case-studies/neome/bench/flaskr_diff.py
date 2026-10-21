"""Black-box differential check: legacy flaskr vs migrated app.

Usage: python flaskr_diff.py <legacy_base> <new_base> [--seeded user:pass]

Replays the same browser-like scenario (cookies, forms, redirects not
followed) against both apps and compares status, redirect target path and
the visible text of every page. A seeded user (created by the legacy app,
so its password hash is werkzeug's) proves migrated data still logs in.
"""
import html
import re
import sys
import urllib.parse

import requests


def visible_text(body: str) -> str:
    body = re.sub(r"(?is)<(script|style).*?</\1>", " ", body)
    body = re.sub(r"(?s)<[^>]+>", " ", body)
    body = html.unescape(body)
    return re.sub(r"\s+", " ", body).strip()


def form_fields(body: str):
    names = re.findall(r'<(?:input|textarea)[^>]*name="([^"]+)"', body)
    return sorted(set(names))


def run(base: str, seeded):
    s = requests.Session()
    out = []

    def step(name, method, path, data=None):
        r = s.request(method, base + path, data=data, allow_redirects=False)
        loc = r.headers.get("Location")
        if loc:
            loc = urllib.parse.urlparse(loc).path or "/"
        ctype = r.headers.get("Content-Type", "").split(";")[0]
        text = visible_text(r.text) if "html" in ctype else r.text.strip()
        if 300 <= r.status_code < 400:
            text = ""  # browsers follow redirects; nobody sees these bodies
        fields = form_fields(r.text) if "html" in ctype else []
        out.append((name, r.status_code, loc, text, fields))

    step("index anon", "GET", "/")
    step("create anon -> login", "GET", "/create")
    step("update anon -> login", "GET", "/1/update")
    step("register page", "GET", "/auth/register")
    step("register empty username", "POST", "/auth/register", {"username": "", "password": "x"})
    step("register empty password", "POST", "/auth/register", {"username": "neo", "password": ""})
    step("register ok", "POST", "/auth/register", {"username": "neo", "password": "s3cret"})
    step("register duplicate", "POST", "/auth/register", {"username": "neo", "password": "x"})
    step("login page", "GET", "/auth/login")
    step("login unknown user", "POST", "/auth/login", {"username": "nobody", "password": "x"})
    step("login wrong password", "POST", "/auth/login", {"username": "neo", "password": "nope"})
    step("login ok", "POST", "/auth/login", {"username": "neo", "password": "s3cret"})
    step("index logged in", "GET", "/")
    step("create page", "GET", "/create")
    step("create no title", "POST", "/create", {"title": "", "body": "b"})
    step("create ok", "POST", "/create", {"title": "Hello <b>&", "body": "line1\nline2"})
    step("create second", "POST", "/create", {"title": "Second", "body": ""})
    step("index two posts", "GET", "/")
    step("update page", "GET", "/1/update")
    step("update no title", "POST", "/1/update", {"title": "", "body": "x"})
    step("update ok", "POST", "/1/update", {"title": "Edited", "body": "new body"})
    step("update missing post", "GET", "/999/update")
    step("delete missing post", "POST", "/999/delete")
    step("delete via GET", "GET", "/2/delete")
    step("delete ok", "POST", "/2/delete")
    step("index after delete", "GET", "/")
    step("logout", "GET", "/auth/logout")
    step("index after logout", "GET", "/")
    step("register other", "POST", "/auth/register", {"username": "other", "password": "pw"})
    step("login other", "POST", "/auth/login", {"username": "other", "password": "pw"})
    step("update foreign post", "GET", "/1/update")
    step("update foreign post POST", "POST", "/1/update", {"title": "hack", "body": ""})
    step("delete foreign post", "POST", "/1/delete")
    step("unknown route", "GET", "/nope")
    step("logout other", "GET", "/auth/logout")
    if seeded:
        user, pw = seeded.split(":", 1)
        step("login seeded legacy user", "POST", "/auth/login", {"username": user, "password": pw})
        step("index seeded", "GET", "/")
    return out


def main():
    legacy, new = sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/")
    seeded = sys.argv[sys.argv.index("--seeded") + 1] if "--seeded" in sys.argv else None
    a, b = run(legacy, seeded), run(new, seeded)
    hard = soft = 0
    for x, y in zip(a, b):
        name = x[0]
        problems = []
        if x[1] != y[1]:
            problems.append(f"status {x[1]} != {y[1]}")
        if x[2] != y[2]:
            problems.append(f"location {x[2]} != {y[2]}")
        if x[4] != y[4]:
            problems.append(f"form fields {x[4]} != {y[4]}")
        if problems:
            hard += 1
        if x[3] != y[3]:
            soft += 1
            problems.append(f"text differs:\n      old: {x[3][:300]}\n      new: {y[3][:300]}")
        print(("OK   " if not problems else "DIFF ") + name)
        for p in problems:
            print("     " + p)
    total = len(a)
    print(f"\n{total - max(hard, 0)} / {total} steps match on status+redirect+forms; "
          f"{total - soft} / {total} match on visible text")
    sys.exit(1 if hard or soft else 0)


if __name__ == "__main__":
    main()

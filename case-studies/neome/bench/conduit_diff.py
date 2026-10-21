"""Black-box differential check: legacy Django Conduit API vs migrated API.

Usage: python conduit_diff.py <legacy_base> <new_base> [--seeded email:pass]

Both apps must start from an empty database (plus the same seeded data).
Every request is sent to both; status codes and JSON bodies are compared
after normalising values that are legitimately different per run (JWTs,
timestamps). Key order is ignored, everything else must match exactly.
"""
import json
import re
import sys

import requests

JWT = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
SLUG = re.compile(r"^([a-z0-9]+(?:-[a-z0-9]+)*)-[a-z0-9]{6}$")
TS = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:?\d\d)?$")


def norm(v):
    if isinstance(v, dict):
        return {k: norm(x) for k, x in v.items()}
    if isinstance(v, list):
        return [norm(x) for x in v]
    if isinstance(v, str) and JWT.match(v):
        return "<jwt>"
    if isinstance(v, str) and TS.match(v):
        return "<ts>"
    if isinstance(v, str) and SLUG.match(v):
        return SLUG.sub(r"\1-<rand>", v)
    return v


def run(base, seeded):
    tokens = {}
    out = []

    def call(name, method, path, body=None, who=None, raw_auth=None):
        headers = {"Content-Type": "application/json"}
        if who:
            headers["Authorization"] = f"Token {tokens[who]}"
        if raw_auth is not None:
            headers["Authorization"] = raw_auth
        r = requests.request(method, base + path, headers=headers,
                             data=json.dumps(body) if body is not None else None)
        try:
            data = r.json()
        except ValueError:
            data = {"<non-json>": r.text[:200]} if r.text.strip() else None
        out.append((name, r.status_code, norm(data)))
        return data

    def register(who, email, pw="password123"):
        d = call(f"register {who}", "POST", "/api/users",
                 {"user": {"username": who, "email": email, "password": pw}})
        if d and "user" in d:
            tokens[who] = d["user"]["token"]

    call("tags empty", "GET", "/api/tags")
    call("articles empty", "GET", "/api/articles")
    call("register missing fields", "POST", "/api/users", {"user": {}})
    call("register short password", "POST", "/api/users",
         {"user": {"username": "x", "email": "x@x.io", "password": "short"}})
    call("register bad email", "POST", "/api/users",
         {"user": {"username": "x", "email": "nope", "password": "password123"}})
    register("alice", "alice@example.com")
    register("bob", "bob@example.com")
    call("register duplicate", "POST", "/api/users",
         {"user": {"username": "alice", "email": "alice@example.com", "password": "password123"}})
    call("login ok", "POST", "/api/users/login",
         {"user": {"email": "alice@example.com", "password": "password123"}})
    call("login wrong password", "POST", "/api/users/login",
         {"user": {"email": "alice@example.com", "password": "nope-nope"}})
    call("login missing", "POST", "/api/users/login", {"user": {}})
    call("current user", "GET", "/api/user", who="alice")
    call("current user no auth", "GET", "/api/user")
    call("current user bad token", "GET", "/api/user", raw_auth="Token abc.def.ghi")
    call("current user bearer prefix", "GET", "/api/user", raw_auth=f"Bearer {tokens.get('alice', '')}")
    call("update user", "PUT", "/api/user",
         {"user": {"bio": "I like cats", "image": "https://img.example/a.png"}}, who="alice")
    call("update user password", "PUT", "/api/user", {"user": {"password": "newpassword1"}}, who="alice")
    call("login new password", "POST", "/api/users/login",
         {"user": {"email": "alice@example.com", "password": "newpassword1"}})
    call("profile anon", "GET", "/api/profiles/alice")
    call("profile missing", "GET", "/api/profiles/nobody")
    call("follow", "POST", "/api/profiles/alice/follow", who="bob")
    call("profile as follower", "GET", "/api/profiles/alice", who="bob")
    call("follow self", "POST", "/api/profiles/bob/follow", who="bob")
    call("follow no auth", "POST", "/api/profiles/alice/follow")
    call("create article no auth", "POST", "/api/articles",
         {"article": {"title": "t", "description": "d", "body": "b"}})
    call("create article invalid", "POST", "/api/articles", {"article": {"title": ""}}, who="alice")
    call("create article", "POST", "/api/articles",
         {"article": {"title": "How to train your dragon", "description": "Ever wonder how?",
                      "body": "You have to believe", "tagList": ["dragons", "training"]}}, who="alice")
    call("create article 2", "POST", "/api/articles",
         {"article": {"title": "Second post", "description": "d2", "body": "b2",
                      "tagList": ["training"]}}, who="alice")
    call("create article by bob", "POST", "/api/articles",
         {"article": {"title": "Bob writes", "description": "d3", "body": "b3"}}, who="bob")
    call("list articles", "GET", "/api/articles")
    call("list articles authed", "GET", "/api/articles", who="bob")
    call("filter tag", "GET", "/api/articles?tag=dragons")
    call("filter author", "GET", "/api/articles?author=bob")
    call("limit offset", "GET", "/api/articles?limit=1&offset=1")
    call("feed", "GET", "/api/articles/feed", who="bob")
    call("feed no auth", "GET", "/api/articles/feed")
    articles = requests.get(base + "/api/articles?author=alice").json().get("articles", [])
    slug = articles[-1]["slug"] if articles else "missing"
    out.append(("slug shape", 200, re.sub(r"[a-z0-9]{6}$", "<rand>", slug)))
    call("get article", "GET", f"/api/articles/{slug}")
    call("get missing article", "GET", "/api/articles/does-not-exist")
    call("update article other user", "PUT", f"/api/articles/{slug}",
         {"article": {"body": "hijack"}}, who="bob")
    call("update article", "PUT", f"/api/articles/{slug}",
         {"article": {"body": "Updated body"}}, who="alice")
    call("favorite", "POST", f"/api/articles/{slug}/favorite", who="bob")
    call("favorited filter", "GET", "/api/articles?favorited=bob")
    call("unfavorite", "DELETE", f"/api/articles/{slug}/favorite", who="bob")
    call("comment no auth", "POST", f"/api/articles/{slug}/comments", {"comment": {"body": "x"}})
    call("comment empty", "POST", f"/api/articles/{slug}/comments", {"comment": {"body": ""}}, who="bob")
    c = call("comment", "POST", f"/api/articles/{slug}/comments", {"comment": {"body": "Nice!"}}, who="bob")
    call("comments list", "GET", f"/api/articles/{slug}/comments")
    cid = (c or {}).get("comment", {}).get("id", 0)
    call("delete comment", "DELETE", f"/api/articles/{slug}/comments/{cid}", who="bob")
    call("comments after delete", "GET", f"/api/articles/{slug}/comments")
    call("tags", "GET", "/api/tags")
    call("unfollow", "DELETE", "/api/profiles/alice/follow", who="bob")
    call("delete article other user", "DELETE", f"/api/articles/{slug}", who="bob")
    call("delete article", "DELETE", f"/api/articles/{slug}", who="alice")
    call("get deleted article", "GET", f"/api/articles/{slug}")
    call("trailing slash", "GET", "/api/tags/")
    if seeded:
        email, pw = seeded.split(":", 1)
        call("login seeded legacy user", "POST", "/api/users/login",
             {"user": {"email": email, "password": pw}})
    return out


def main():
    legacy, new = sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/")
    seeded = sys.argv[sys.argv.index("--seeded") + 1] if "--seeded" in sys.argv else None
    a, b = run(legacy, seeded), run(new, seeded)
    bad = 0
    for x, y in zip(a, b):
        same = x[1] == y[1] and x[2] == y[2]
        bad += not same
        print(("OK   " if same else "DIFF ") + x[0])
        if not same:
            print(f"     old {x[1]}: {json.dumps(x[2], sort_keys=True)[:400]}")
            print(f"     new {y[1]}: {json.dumps(y[2], sort_keys=True)[:400]}")
    print(f"\n{len(a) - bad} / {len(a)} requests identical")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

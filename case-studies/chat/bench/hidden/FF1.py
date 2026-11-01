import json
from functools import partial

import pytest
from click.testing import CliRunner

from flask import Flask
from flask.cli import FlaskGroup


def _invoke(app):
    cli = FlaskGroup(create_app=lambda: app)
    return partial(CliRunner().invoke, cli)


@pytest.fixture
def app():
    app = Flask(__name__)
    app.add_url_rule(
        "/get_post/<int:x>/<int:y>", methods=["GET", "POST"], endpoint="yyy_get_post"
    )
    app.add_url_rule("/zzz_post", methods=["POST"], endpoint="aaa_post")
    return app


def test_json_shape_and_default_sort(app):
    result = _invoke(app)(["routes", "--json"])
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert [row["endpoint"] for row in data] == ["aaa_post", "static", "yyy_get_post"]
    by = {row["endpoint"]: row for row in data}
    assert set(by["yyy_get_post"]) == {"endpoint", "methods", "domain", "rule"}
    assert by["yyy_get_post"]["methods"] == ["GET", "POST"]
    assert by["yyy_get_post"]["rule"] == "/get_post/<int:x>/<int:y>"
    assert by["aaa_post"]["methods"] == ["POST"]
    assert by["aaa_post"]["domain"] is None


def test_json_sort_rule(app):
    data = json.loads(_invoke(app)(["routes", "--json", "-s", "rule"]).output)
    assert [row["endpoint"] for row in data] == ["yyy_get_post", "static", "aaa_post"]


def test_json_all_methods(app):
    data = json.loads(_invoke(app)(["routes", "--json", "--all-methods"]).output)
    by = {row["endpoint"]: row for row in data}
    assert by["yyy_get_post"]["methods"] == ["GET", "HEAD", "OPTIONS", "POST"]


def test_json_subdomain():
    app = Flask(__name__, subdomain_matching=True)
    app.config["SERVER_NAME"] = "example.test"
    app.add_url_rule("/a", endpoint="api_a", subdomain="api")
    app.add_url_rule("/b", endpoint="plain_b")
    by = {r["endpoint"]: r for r in json.loads(_invoke(app)(["routes", "--json"]).output)}
    assert by["api_a"]["domain"] == "api"
    assert by["plain_b"]["domain"] is None


def test_json_empty():
    app = Flask(__name__, static_folder=None)
    result = _invoke(app)(["routes", "--json"])
    assert result.exit_code == 0
    assert json.loads(result.output) == []


def test_table_unchanged(app):
    output = _invoke(app)(["routes"]).output
    assert output.splitlines()[0].split() == ["Endpoint", "Methods", "Rule"]

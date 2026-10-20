import sys

import pytest


def test_teardown_request_reverse_order_and_exception(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = RuntimeError("view error")
    calls = []

    @app.teardown_request
    def teardown_first(exc):
        calls.append(("first", exc))

    @app.teardown_request
    def teardown_second(exc):
        calls.append(("second", exc))

    @app.teardown_request
    def teardown_third(exc):
        calls.append(("third", exc))

    @app.route("/")
    def index():
        raise view_exc

    rv = client.get("/")
    assert rv.status_code == 500
    assert calls == [
        ("third", view_exc),
        ("second", view_exc),
        ("first", view_exc),
    ]
    assert [exc is view_exc for _, exc in calls] == [True, True, True]


def test_teardown_request_continues_after_error(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = RuntimeError("view error")
    teardown_exc = ValueError("teardown error")
    calls = []

    @app.teardown_request
    def teardown_first(exc):
        calls.append(("first", exc))

    @app.teardown_request
    def teardown_second(exc):
        calls.append(("second", exc))
        raise teardown_exc

    @app.teardown_request
    def teardown_third(exc):
        calls.append(("third", exc))

    @app.route("/")
    def index():
        raise view_exc

    if sys.version_info >= (3, 11):
        with pytest.raises(
            ExceptionGroup, match="Errors during context teardown"  # noqa: F821
        ) as exc_info:
            client.get("/")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert [exc is view_exc for _, exc in calls] == [True, True, True]

        assert len(exc_info.value.exceptions) == 1
        req_group = exc_info.value.exceptions[0]
        assert isinstance(req_group, ExceptionGroup)  # noqa: F821
        assert req_group.message == "Errors during request teardown"
        assert req_group.exceptions == (teardown_exc,)
    else:
        with pytest.raises(ValueError, match="teardown error") as exc_info:
            client.get("/")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert [exc is view_exc for _, exc in calls] == [True, True, True]
        assert exc_info.value is teardown_exc

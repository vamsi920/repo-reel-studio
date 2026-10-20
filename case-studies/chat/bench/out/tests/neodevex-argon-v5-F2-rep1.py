import sys

import pytest


def test_teardown_request_reverse_order_and_exception(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ValueError("view error")
    calls = []

    @app.teardown_request
    def first(exc):
        calls.append(("first", exc))

    @app.teardown_request
    def second(exc):
        calls.append(("second", exc))

    @app.teardown_request
    def third(exc):
        calls.append(("third", exc))

    @app.route("/")
    def index():
        raise view_exc

    response = client.get("/")
    assert response.status_code == 500
    assert calls == [
        ("third", view_exc),
        ("second", view_exc),
        ("first", view_exc),
    ]
    assert all(exc is view_exc for _, exc in calls)


def test_teardown_request_continues_after_error(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ValueError("view error")
    teardown_exc = RuntimeError("teardown error")
    calls = []

    @app.teardown_request
    def first(exc):
        calls.append(("first", exc))

    @app.teardown_request
    def second(exc):
        calls.append(("second", exc))
        raise teardown_exc

    @app.teardown_request
    def third(exc):
        calls.append(("third", exc))

    @app.route("/")
    def index():
        raise view_exc

    if sys.version_info >= (3, 11):
        with pytest.raises(
            ExceptionGroup, match="Errors during context teardown"
        ) as exc_info:
            client.get("/")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert all(exc is view_exc for _, exc in calls)
        assert len(exc_info.value.exceptions) == 1
        req_group = exc_info.value.exceptions[0]
        assert isinstance(req_group, ExceptionGroup)
        assert req_group.message == "Errors during request teardown"
        assert req_group.exceptions == (teardown_exc,)
    else:
        with pytest.raises(RuntimeError, match="teardown error") as exc_info:
            client.get("/")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert all(exc is view_exc for _, exc in calls)
        assert exc_info.value is teardown_exc

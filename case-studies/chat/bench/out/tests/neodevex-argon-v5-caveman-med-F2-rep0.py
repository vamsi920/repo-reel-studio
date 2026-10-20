import sys

import pytest


def test_teardown_request_reverse_order_and_exception(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ZeroDivisionError("view error")
    calls = []

    @app.teardown_request
    def teardown_1(exc):
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc):
        calls.append(("teardown_2", exc))

    @app.teardown_request
    def teardown_3(exc):
        calls.append(("teardown_3", exc))

    @app.route("/")
    def index():
        raise view_exc

    response = client.get("/")
    assert response.status_code == 500
    assert calls == [
        ("teardown_3", view_exc),
        ("teardown_2", view_exc),
        ("teardown_1", view_exc),
    ]


def test_teardown_request_continues_when_one_raises(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ZeroDivisionError("view error")
    teardown_exc = RuntimeError("teardown_3 failed")
    calls = []

    @app.teardown_request
    def teardown_1(exc):
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc):
        calls.append(("teardown_2", exc))

    @app.teardown_request
    def teardown_3(exc):
        calls.append(("teardown_3", exc))
        raise teardown_exc

    @app.route("/")
    def index():
        raise view_exc

    if sys.version_info >= (3, 11):
        with pytest.raises(
            ExceptionGroup, match="Errors during context teardown"
        ) as exc_info:
            client.get("/")

        assert calls == [
            ("teardown_3", view_exc),
            ("teardown_2", view_exc),
            ("teardown_1", view_exc),
        ]
        assert len(exc_info.value.exceptions) == 1
        req_group = exc_info.value.exceptions[0]
        assert isinstance(req_group, ExceptionGroup)
        assert req_group.message == "Errors during request teardown"
        assert req_group.exceptions == (teardown_exc,)
    else:
        with pytest.raises(RuntimeError, match="teardown_3 failed") as exc_info:
            client.get("/")

        assert calls == [
            ("teardown_3", view_exc),
            ("teardown_2", view_exc),
            ("teardown_1", view_exc),
        ]
        assert exc_info.value is teardown_exc

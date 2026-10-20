import sys

import pytest


def test_teardown_request_reverse_order_and_exception(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_error = ValueError("view failed")
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
        raise view_error

    response = client.get("/")
    assert response.status_code == 500
    assert calls == [
        ("teardown_3", view_error),
        ("teardown_2", view_error),
        ("teardown_1", view_error),
    ]
    assert all(exc is view_error for _, exc in calls)


def test_teardown_request_continues_after_error(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_error = ValueError("view failed")
    teardown_error = RuntimeError("teardown failed")
    calls = []

    @app.teardown_request
    def teardown_1(exc):
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc):
        calls.append(("teardown_2", exc))
        raise teardown_error

    @app.teardown_request
    def teardown_3(exc):
        calls.append(("teardown_3", exc))

    @app.route("/")
    def index():
        raise view_error

    if sys.version_info >= (3, 11):
        with pytest.raises(
            ExceptionGroup, match="Errors during context teardown"
        ) as exc_info:
            client.get("/")

        assert calls == [
            ("teardown_3", view_error),
            ("teardown_2", view_error),
            ("teardown_1", view_error),
        ]
        assert all(exc is view_error for _, exc in calls)
        assert len(exc_info.value.exceptions) == 1
        req_group = exc_info.value.exceptions[0]
        assert isinstance(req_group, ExceptionGroup)
        assert "Errors during request teardown" in req_group.message
        assert req_group.exceptions == (teardown_error,)
    else:
        with pytest.raises(RuntimeError, match="teardown failed") as exc_info:
            client.get("/")

        assert calls == [
            ("teardown_3", view_error),
            ("teardown_2", view_error),
            ("teardown_1", view_error),
        ]
        assert all(exc is view_error for _, exc in calls)
        assert exc_info.value is teardown_error

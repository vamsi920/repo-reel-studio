import sys

import pytest

import flask
from flask.testing import FlaskClient


def test_teardown_request_reverse_order_and_exception(
    app: flask.Flask, client: FlaskClient
) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_error = ValueError("view error")
    calls: list[tuple[str, BaseException | None]] = []

    @app.teardown_request
    def teardown_1(exc: BaseException | None) -> None:
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc: BaseException | None) -> None:
        calls.append(("teardown_2", exc))

    @app.teardown_request
    def teardown_3(exc: BaseException | None) -> None:
        calls.append(("teardown_3", exc))

    @app.route("/")
    def index() -> str:
        raise view_error

    response = client.get("/")
    assert response.status_code == 500
    assert calls == [
        ("teardown_3", view_error),
        ("teardown_2", view_error),
        ("teardown_1", view_error),
    ]
    assert all(exc is view_error for _, exc in calls)


def test_teardown_request_continues_after_error(
    app: flask.Flask, client: FlaskClient
) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_error = ValueError("view error")
    teardown_error = RuntimeError("teardown_2 error")
    calls: list[tuple[str, BaseException | None]] = []

    @app.teardown_request
    def teardown_1(exc: BaseException | None) -> None:
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc: BaseException | None) -> None:
        calls.append(("teardown_2", exc))
        raise teardown_error

    @app.teardown_request
    def teardown_3(exc: BaseException | None) -> None:
        calls.append(("teardown_3", exc))

    @app.route("/")
    def index() -> str:
        raise view_error

    if sys.version_info >= (3, 11):
        with pytest.raises(
            ExceptionGroup, match="Errors during context teardown"  # noqa: F821
        ) as exc_info:
            client.get("/")

        assert calls == [
            ("teardown_3", view_error),
            ("teardown_2", view_error),
            ("teardown_1", view_error),
        ]
        assert all(exc is view_error for _, exc in calls)
        assert len(exc_info.value.exceptions) == 1
        req_exc_group = exc_info.value.exceptions[0]
        assert isinstance(req_exc_group, ExceptionGroup)  # noqa: F821
        assert req_exc_group.message == "Errors during request teardown"
        assert req_exc_group.exceptions == (teardown_error,)
    else:
        with pytest.raises(RuntimeError, match="teardown_2 error") as exc_info:
            client.get("/")

        assert calls == [
            ("teardown_3", view_error),
            ("teardown_2", view_error),
            ("teardown_1", view_error),
        ]
        assert all(exc is view_error for _, exc in calls)
        assert exc_info.value is teardown_error

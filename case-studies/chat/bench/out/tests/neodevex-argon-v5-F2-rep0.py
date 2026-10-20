from __future__ import annotations

import sys

import flask
import pytest
from flask.testing import FlaskClient


def test_teardown_request_reverse_order_and_exception(
    app: flask.Flask, client: FlaskClient
) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_error = RuntimeError("view failed")
    calls: list[tuple[str, BaseException | None]] = []

    @app.teardown_request
    def teardown_first(exc: BaseException | None) -> None:
        calls.append(("first", exc))

    @app.teardown_request
    def teardown_second(exc: BaseException | None) -> None:
        calls.append(("second", exc))

    @app.teardown_request
    def teardown_third(exc: BaseException | None) -> None:
        calls.append(("third", exc))

    @app.route("/fail")
    def fail() -> str:
        raise view_error

    response = client.get("/fail")
    assert response.status_code == 500
    assert calls == [
        ("third", view_error),
        ("second", view_error),
        ("first", view_error),
    ]
    assert all(exc is view_error for _, exc in calls)


def test_teardown_request_continues_when_one_raises(
    app: flask.Flask, client: FlaskClient
) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_error = RuntimeError("view failed")
    teardown_error = ValueError("teardown second failed")
    calls: list[tuple[str, BaseException | None]] = []

    @app.teardown_request
    def teardown_first(exc: BaseException | None) -> None:
        calls.append(("first", exc))

    @app.teardown_request
    def teardown_second(exc: BaseException | None) -> None:
        calls.append(("second", exc))
        raise teardown_error

    @app.teardown_request
    def teardown_third(exc: BaseException | None) -> None:
        calls.append(("third", exc))

    @app.route("/fail")
    def fail() -> str:
        raise view_error

    if sys.version_info >= (3, 11):
        with pytest.raises(
            ExceptionGroup, match="Errors during context teardown"  # noqa: F821
        ) as exc_info:
            client.get("/fail")

        assert calls == [
            ("third", view_error),
            ("second", view_error),
            ("first", view_error),
        ]
        assert all(exc is view_error for _, exc in calls)
        assert len(exc_info.value.exceptions) == 1
        req_eg = exc_info.value.exceptions[0]
        assert isinstance(req_eg, ExceptionGroup)  # noqa: F821
        assert req_eg.message == "Errors during request teardown"
        assert req_eg.exceptions == (teardown_error,)
    else:
        with pytest.raises(ValueError, match="teardown second failed") as exc_info:
            client.get("/fail")

        assert calls == [
            ("third", view_error),
            ("second", view_error),
            ("first", view_error),
        ]
        assert all(exc is view_error for _, exc in calls)
        assert exc_info.value is teardown_error

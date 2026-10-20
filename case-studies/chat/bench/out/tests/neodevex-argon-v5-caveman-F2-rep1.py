import sys

import flask
import pytest
from flask.testing import FlaskClient


def test_teardown_request_reverse_order_and_exception(
    app: flask.Flask, client: FlaskClient
) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ValueError("view failed")
    calls: list[tuple[str, BaseException | None]] = []

    @app.teardown_request
    def first(exc: BaseException | None) -> None:
        calls.append(("first", exc))

    @app.teardown_request
    def second(exc: BaseException | None) -> None:
        calls.append(("second", exc))

    @app.teardown_request
    def third(exc: BaseException | None) -> None:
        calls.append(("third", exc))

    @app.get("/")
    def index() -> str:
        raise view_exc

    response = client.get("/")
    assert response.status_code == 500
    assert calls == [
        ("third", view_exc),
        ("second", view_exc),
        ("first", view_exc),
    ]
    assert all(exc is view_exc for _, exc in calls)


def test_teardown_request_continues_after_error(
    app: flask.Flask, client: FlaskClient
) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ValueError("view failed")
    teardown_exc = RuntimeError("teardown failed")
    calls: list[tuple[str, BaseException | None]] = []

    @app.teardown_request
    def first(exc: BaseException | None) -> None:
        calls.append(("first", exc))

    @app.teardown_request
    def second(exc: BaseException | None) -> None:
        calls.append(("second", exc))

    @app.teardown_request
    def third(exc: BaseException | None) -> None:
        calls.append(("third", exc))
        raise teardown_exc

    @app.get("/")
    def index() -> str:
        raise view_exc

    if sys.version_info >= (3, 11):
        with pytest.raises(ExceptionGroup, match="context teardown") as exc_info:  # noqa: F821
            client.get("/")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert all(exc is view_exc for _, exc in calls)
        assert len(exc_info.value.exceptions) == 1
        req_eg = exc_info.value.exceptions[0]
        assert isinstance(req_eg, ExceptionGroup)  # noqa: F821
        assert "request teardown" in req_eg.message
        assert req_eg.exceptions == (teardown_exc,)
    else:
        with pytest.raises(RuntimeError) as exc_info:
            client.get("/")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert all(exc is view_exc for _, exc in calls)
        assert exc_info.value is teardown_exc

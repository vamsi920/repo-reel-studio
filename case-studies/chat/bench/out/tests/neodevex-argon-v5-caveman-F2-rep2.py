import sys

import pytest

from flask import Flask


def test_teardown_request_reverse_order_and_receives_view_exception(
    app: Flask,
) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ZeroDivisionError("view failed")
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
        raise view_exc

    client = app.test_client()
    response = client.get("/fail")

    assert response.status_code == 500
    assert calls == [
        ("third", view_exc),
        ("second", view_exc),
        ("first", view_exc),
    ]
    assert all(exc is view_exc for _, exc in calls)


def test_teardown_request_remaining_run_when_one_raises(app: Flask) -> None:
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ZeroDivisionError("view failed")
    teardown_exc = RuntimeError("teardown failed")
    calls: list[tuple[str, BaseException | None]] = []

    @app.teardown_request
    def teardown_first(exc: BaseException | None) -> None:
        calls.append(("first", exc))

    @app.teardown_request
    def teardown_second(exc: BaseException | None) -> None:
        calls.append(("second", exc))
        raise teardown_exc

    @app.teardown_request
    def teardown_third(exc: BaseException | None) -> None:
        calls.append(("third", exc))

    @app.route("/fail")
    def fail() -> str:
        raise view_exc

    client = app.test_client()

    if sys.version_info >= (3, 11):
        with pytest.raises(
            ExceptionGroup, match="Errors during context teardown"  # noqa: F821
        ) as exc_info:
            client.get("/fail")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert all(exc is view_exc for _, exc in calls)
        assert len(exc_info.value.exceptions) == 1
        req_eg = exc_info.value.exceptions[0]
        assert isinstance(req_eg, ExceptionGroup)  # noqa: F821
        assert req_eg.message == "Errors during request teardown"
        assert req_eg.exceptions == (teardown_exc,)
    else:
        with pytest.raises(RuntimeError, match="teardown failed") as exc_info:
            client.get("/fail")

        assert calls == [
            ("third", view_exc),
            ("second", view_exc),
            ("first", view_exc),
        ]
        assert all(exc is view_exc for _, exc in calls)
        assert exc_info.value is teardown_exc

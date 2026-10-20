import pytest

from flask import Flask


def test_teardown_request_exception_order(app_ctx):
    app = app_ctx.app
    app.config["PROPAGATE_EXCEPTIONS"] = False

    order = []

    @app.teardown_request
    def t1(exc):
        order.append(1)

    @app.teardown_request
    def t2(exc):
        order.append(2)
        raise TypeError("teardown error")

    @app.teardown_request
    def t3(exc):
        order.append(3)

    @app.route("/")
    def index():
        raise ValueError("view error")

    with pytest.raises(ExceptionGroup) as exc_info:
        with app.test_client() as client:
            res = client.get("/")
            assert res.status_code == 500
            assert b"ValueError: view error" in res.data
            assert order == [3, 2, 1]

    # Check that the ExceptionGroup contains the TypeError from t2
    assert any(isinstance(e, TypeError) and "teardown error" in str(e) for e in exc_info.value.exceptions[0].exceptions)


def test_teardown_request_exception_return(app_ctx):
    app = app_ctx.app
    app.config["PROPAGATE_EXCEPTIONS"] = False

    order = []

    @app.teardown_request
    def t1(exc):
        order.append(1)

    @app.teardown_request
    def t2(exc):
        order.append(2)

    @app.teardown_request
    def t3(exc):
        order.append(3)

    @app.route("/")
    def index():
        raise ValueError("view error")

    with app.test_client() as client:
        res = client.get("/")
        assert res.status_code == 500
        assert order == [3, 2, 1]

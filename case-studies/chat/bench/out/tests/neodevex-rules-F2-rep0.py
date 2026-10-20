import pytest

from flask import Flask


def test_teardown_request_exception_handling():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    order = []

    @app.teardown_request
    def tdr_1(exc):
        order.append(1)
        assert isinstance(exc, ValueError)
        assert exc.args[0] == "view error"

    @app.teardown_request
    def tdr_2(exc):
        order.append(2)
        assert isinstance(exc, ValueError)
        assert exc.args[0] == "view error"
        raise TypeError("teardown error 2")

    @app.teardown_request
    def tdr_3(exc):
        order.append(3)
        assert isinstance(exc, ValueError)
        assert exc.args[0] == "view error"
        raise RuntimeError("teardown error 3")

    @app.route("/")
    def index():
        raise ValueError("view error")

    with app.test_request_context():
        response = app.full_dispatch_request()

    assert response.status_code == 500
    assert order == [3, 2, 1]

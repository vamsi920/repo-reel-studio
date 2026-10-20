import pytest

from flask import Flask


def test_teardown_request_with_view_exception():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    call_order = []
    exc_order = []

    @app.teardown_request
    def teardown1(exc):
        call_order.append(1)
        exc_order.append(exc)

    @app.teardown_request
    def teardown2(exc):
        call_order.append(2)
        exc_order.append(exc)
        raise TypeError("teardown2")

    @app.teardown_request
    def teardown3(exc):
        call_order.append(3)
        exc_order.append(exc)

    @app.route("/")
    def index():
        raise ValueError("view")

    client = app.test_client()

    with pytest.raises(TypeError):
        client.get("/")
    assert call_order == [3, 2, 1]
    assert len(exc_order) == 3
    assert all(isinstance(exc, ValueError) for exc in exc_order)
    assert all(exc.args == ("view",) for exc in exc_order)

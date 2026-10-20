import pytest
from flask import Flask


def test_teardown_request_handlers_propagate_exceptions():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    teardown_exc = []

    @app.teardown_request
    def teardown1(exc):
        teardown_exc.append(exc)

    @app.teardown_request
    def teardown2(exc):
        teardown_exc.append(exc)

    @app.route("/")
    def index():
        raise ValueError("test")

    client = app.test_client()
    client.get("/")
    assert len(teardown_exc) == 2
    assert str(teardown_exc[0]) == "test"
    assert teardown_exc[0] is teardown_exc[1]


def test_teardown_request_handlers_order_on_exception():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    teardown_order = []

    @app.teardown_request
    def teardown1(exc):
        teardown_order.append(1)

    @app.teardown_request
    def teardown2(exc):
        teardown_order.append(2)

    @app.route("/")
    def index():
        raise ValueError("test")

    client = app.test_client()
    client.get("/")
    assert teardown_order == [2, 1]


def test_teardown_request_handlers_safe_on_exception():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    teardown_order = []
    teardown_exc = []

    @app.teardown_request
    def teardown1(exc):
        teardown_order.append(1)
        teardown_exc.append(exc)
        raise TypeError("teardown1")

    @app.teardown_request
    def teardown2(exc):
        teardown_order.append(2)
        teardown_exc.append(exc)

    @app.route("/")
    def index():
        raise ValueError("index")

    client = app.test_client()

    with pytest.raises(TypeError):
        client.get("/")

    assert teardown_order == [2, 1]
    assert len(teardown_exc) == 2
    assert str(teardown_exc[0]) == "index"
    assert teardown_exc[0] is teardown_exc[1]

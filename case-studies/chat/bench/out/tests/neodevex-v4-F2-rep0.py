import pytest

from flask import Flask, request, signals


class TeardownBench:
    def __init__(self, app):
        self.app = app
        self.recorded = []

    def make_app(self):
        self.app.testing = True
        self.app.config["PROPAGATE_EXCEPTIONS"] = False

        @self.app.route("/")
        def index():
            raise ValueError("bad view")

        @self.app.teardown_request
        def tdr1(exc):
            self.recorded.append(f"tdr1:{type(exc).__name__}")

        @self.app.teardown_request
        def tdr2(exc):
            self.recorded.append(f"tdr2:{type(exc).__name__}")
            raise TypeError("bad teardown 2")

        @self.app.teardown_request
        def tdr3(exc):
            self.recorded.append(f"tdr3:{type(exc).__name__}")

        return self.app

    def run_test(self):
        with self.app.test_client() as client:
            client.get("/")


@pytest.fixture()
def app():
    app = Flask(__name__)
    yield app


def test_teardown_reverse_order_and_exception(app):
    tb = TeardownBench(app)
    tb.make_app()
    with pytest.raises(ExceptionGroup) as exc_info:
        tb.run_test()

    assert exc_info.group_contains(TypeError, match="bad teardown 2")

    # The order of teardown functions is reverse of registration
    # The original exception (ValueError) is passed to each teardown function
    assert tb.recorded == ["tdr3:ValueError", "tdr2:ValueError", "tdr1:ValueError"]


def test_teardown_one_raises_others_still_run(app):
    tb = TeardownBench(app)
    tb.make_app()

    with pytest.raises(ExceptionGroup) as exc_info:
        tb.run_test()

    # All teardown functions still run, even if one raises
    assert len(tb.recorded) == 3
    assert "tdr1:ValueError" in tb.recorded
    assert "tdr2:ValueError" in tb.recorded
    assert "tdr3:ValueError" in tb.recorded

    # Both the view exception and the teardown exception are in the ExceptionGroup
    assert exc_info.group_contains(TypeError, match="bad teardown 2")

import pytest
from flask import Flask


def test_teardown_request_exception_handling():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    app.testing = True

    events = []

    @app.route("/")
    def index():
        raise ValueError("view error")

    @app.teardown_request
    def teardown_1(exc):
        events.append(("teardown_1", type(exc).__name__, str(exc)))

    @app.teardown_request
    def teardown_2(exc):
        events.append(("teardown_2", type(exc).__name__, str(exc)))

    @app.teardown_request
    def teardown_3(exc):
        events.append(("teardown_3", type(exc).__name__, str(exc)))

    with app.test_client() as client:
        response = client.get("/")
        assert response.status_code == 500

    # Verify teardown functions run twice (once with exception, once with None)
    assert len(events) == 6
    # First set of calls (with exception from view)
    assert events[0] == ("teardown_3", "ValueError", "view error")
    assert events[1] == ("teardown_2", "ValueError", "view error")
    assert events[2] == ("teardown_1", "ValueError", "view error")
    # Second set of calls (after exception handling, with None)
    assert events[3] == ("teardown_3", "NoneType", "None")
    assert events[4] == ("teardown_2", "NoneType", "None")
    assert events[5] == ("teardown_1", "NoneType", "None")


def test_teardown_request_exception_in_teardown():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    app.testing = True

    events = []

    @app.route("/")
    def index():
        raise ValueError("view error")

    @app.teardown_request
    def teardown_1(exc):
        events.append(("teardown_1", type(exc).__name__, str(exc)))

    @app.teardown_request
    def teardown_2(exc):
        events.append(("teardown_2", type(exc).__name__, str(exc)))
        raise RuntimeError("teardown error")

    @app.teardown_request
    def teardown_3(exc):
        events.append(("teardown_3", type(exc).__name__, str(exc)))

    with app.test_client() as client:
        with pytest.raises(ExceptionGroup) as excinfo:
            client.get("/")

        # Check the exception group contains the RuntimeError from teardown_2
        assert len(excinfo.value.exceptions) == 1
        assert isinstance(excinfo.value.exceptions[0], ExceptionGroup)
        assert len(excinfo.value.exceptions[0].exceptions) == 1
        assert isinstance(excinfo.value.exceptions[0].exceptions[0], RuntimeError)
        assert "teardown error" in str(excinfo.value.exceptions[0].exceptions[0])

    # Verify all teardown functions run, even if one raises an exception
    assert len(events) == 3
    # First set of calls (with exception from view)
    assert events[0] == ("teardown_3", "ValueError", "view error")
    assert events[1] == ("teardown_2", "ValueError", "view error")
    assert events[2] == ("teardown_1", "ValueError", "view error")
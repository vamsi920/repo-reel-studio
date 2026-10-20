import pytest
from flask import Flask


def test_teardown_request_exception_handling():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    
    events = []

    @app.teardown_request
    def tdr1(exc):
        events.append(("tdr1", exc))

    @app.teardown_request
    def tdr2(exc):
        events.append(("tdr2", exc))

    @app.route("/")
    def view():
        raise RuntimeError("view error")

    with app.test_client() as client:
        client.get("/")

    # Filter events to only include those where an exception was passed to teardown
    exception_events = [e for e in events if e[1] is not None]

    assert len(exception_events) == 2
    assert exception_events[0][0] == "tdr2"
    assert isinstance(exception_events[0][1], RuntimeError)
    assert exception_events[1][0] == "tdr1"
    assert isinstance(exception_events[1][1], RuntimeError)


def test_teardown_request_exception_in_teardown():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    events = []

    @app.teardown_request
    def tdr1(exc):
        events.append(("tdr1", exc))

    @app.teardown_request
    def tdr2(exc):
        events.append(("tdr2", exc))
        raise ValueError("teardown error")

    @app.teardown_request
    def tdr3(exc):
        events.append(("tdr3", exc))

    @app.route("/")
    def view():
        raise RuntimeError("view error")

    with app.test_client() as client:
        with pytest.raises(ExceptionGroup) as excinfo:
            client.get("/")

    # The ExceptionGroup should contain the ValueError from tdr2
    found_value_error = False
    for exc in excinfo.value.exceptions:
        if isinstance(exc, ExceptionGroup):
            if any(isinstance(e, ValueError) for e in exc.exceptions):
                found_value_error = True
                break
    assert found_value_error

    # Filter events to only include those where an exception was passed to teardown
    exception_events = [e for e in events if e[1] is not None]

    assert len(exception_events) == 3
    assert exception_events[0][0] == "tdr3"
    assert isinstance(exception_events[0][1], RuntimeError)
    assert exception_events[1][0] == "tdr2"
    assert isinstance(exception_events[1][1], RuntimeError)
    assert exception_events[2][0] == "tdr1"
    assert isinstance(exception_events[2][1], RuntimeError) # tdr1 still receives RuntimeError from view


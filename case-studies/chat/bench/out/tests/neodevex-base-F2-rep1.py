import pytest
from flask import Flask

def test_teardown_request_exception_handling(caplog):
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    teardown_calls = []

    @app.teardown_request
    def teardown_1(exc):
        teardown_calls.append(("teardown_1", exc))
        assert exc is None or isinstance(exc, ValueError)
        return exc

    @app.teardown_request
    def teardown_2(exc):
        teardown_calls.append(("teardown_2", exc))
        assert exc is None or isinstance(exc, ValueError)
        try:
            raise TypeError("Teardown 2 exception")
        except TypeError as e:
            app.logger.error("Error in teardown_2: %s", e)

    @app.teardown_request
    def teardown_3(exc):
        teardown_calls.append(("teardown_3", exc))
        assert exc is None or isinstance(exc, ValueError)
        return exc

    @app.route("/error")
    def error_view():
        raise ValueError("View exception")

    with app.test_client() as client:
        response = client.get("/error")
        assert response.status_code == 500

    # Check for the logged exception from teardown_2
    assert "Error in teardown_2: Teardown 2 exception" in caplog.text

    # Teardown functions are called in reverse order of registration
    # They are called twice: once with the exception, once with None
    assert len(teardown_calls) == 6

    # First set of calls (due to the exception)
    assert teardown_calls[0][0] == "teardown_3"
    assert isinstance(teardown_calls[0][1], ValueError)

    assert teardown_calls[1][0] == "teardown_2"
    assert isinstance(teardown_calls[1][1], ValueError)

    assert teardown_calls[2][0] == "teardown_1"
    assert isinstance(teardown_calls[2][1], ValueError)

    # Second set of calls (context cleanup, no active exception)
    assert teardown_calls[3][0] == "teardown_3"
    assert teardown_calls[3][1] is None

    assert teardown_calls[4][0] == "teardown_2"
    assert teardown_calls[4][1] is None

    assert teardown_calls[5][0] == "teardown_1"
    assert teardown_calls[5][1] is None

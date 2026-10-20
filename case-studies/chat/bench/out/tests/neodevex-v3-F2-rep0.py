import pytest
from flask import Flask

@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    return app

def test_teardown_request_exception_handling(app):
    recorded = []

    @app.teardown_request
    def t1(exc):
        recorded.append(("t1", exc))

    @app.teardown_request
    def t2(exc):
        recorded.append(("t2", exc))
        raise ValueError("teardown error")

    @app.teardown_request
    def t3(exc):
        recorded.append(("t3", exc))

    @app.route("/")
    def index():
        raise RuntimeError("view error")

    with pytest.raises(ExceptionGroup) as excinfo:
        with app.test_client() as client:
            response = client.get("/")
            assert response.status_code == 500

    # Check that the ExceptionGroup contains the ValueError from t2
    # The ValueError is nested within two ExceptionGroups due to Flask's error handling.
    assert len(excinfo.value.exceptions) == 1
    outer_eg = excinfo.value.exceptions[0]
    assert isinstance(outer_eg, ExceptionGroup)
    assert len(outer_eg.exceptions) == 1
    inner_exc = outer_eg.exceptions[0]
    assert isinstance(inner_exc, ValueError)
    assert str(inner_exc) == "teardown error"

    # Teardown functions run in reverse order of registration: t3, t2, t1
    # The exception from the view is passed to the teardown functions,
    # regardless of PROPAGATE_EXCEPTIONS.
    assert len(recorded) == 3
    assert recorded[0][0] == "t3"
    assert recorded[1][0] == "t2"
    assert recorded[2][0] == "t1"

    # Verify that the exception passed to the teardown functions is the
    # RuntimeError raised by the view function.
    for _, exc_val in recorded:
        assert isinstance(exc_val, RuntimeError)
        assert str(exc_val) == "view error"

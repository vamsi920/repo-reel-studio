import sys

import pytest

import flask


class ViewError(Exception):
    pass


class TeardownError(Exception):
    pass


def leaf_exceptions(error):
    if sys.version_info >= (3, 11) and isinstance(error, BaseExceptionGroup):  # noqa: F821
        return [leaf for e in error.exceptions for leaf in leaf_exceptions(e)]

    return [error]


@pytest.fixture
def app():
    app = flask.Flask(__name__)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    return app


def test_teardown_request_reverse_order_receives_view_exception(app):
    raised = []
    calls = []

    @app.route("/")
    def index():
        error = ViewError("view failed")
        raised.append(error)
        raise error

    @app.teardown_request
    def teardown_1(exc):
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc):
        calls.append(("teardown_2", exc))

    @app.teardown_request
    def teardown_3(exc):
        calls.append(("teardown_3", exc))

    rv = app.test_client().get("/")

    assert rv.status_code == 500
    assert len(raised) == 1
    assert [name for name, _ in calls] == ["teardown_3", "teardown_2", "teardown_1"]
    assert all(exc is raised[0] for _, exc in calls)


def test_teardown_request_error_does_not_stop_remaining(app):
    raised = []
    calls = []

    @app.route("/")
    def index():
        error = ViewError("view failed")
        raised.append(error)
        raise error

    @app.teardown_request
    def teardown_1(exc):
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc):
        calls.append(("teardown_2", exc))
        raise TeardownError("teardown failed")

    @app.teardown_request
    def teardown_3(exc):
        calls.append(("teardown_3", exc))

    with pytest.raises(BaseException) as exc_info:
        app.test_client().get("/")

    assert [type(e) for e in leaf_exceptions(exc_info.value)] == [TeardownError]
    assert [name for name, _ in calls] == ["teardown_3", "teardown_2", "teardown_1"]
    assert all(exc is raised[0] for _, exc in calls)

import pytest


def test_teardown_request_reverse_order_receives_view_exception(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ValueError("view error")
    calls = []

    @app.teardown_request
    def teardown_1(exc):
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc):
        calls.append(("teardown_2", exc))

    @app.teardown_request
    def teardown_3(exc):
        calls.append(("teardown_3", exc))

    @app.route("/")
    def index():
        raise view_exc

    response = client.get("/")
    assert response.status_code == 500
    assert calls == [
        ("teardown_3", view_exc),
        ("teardown_2", view_exc),
        ("teardown_1", view_exc),
    ]
    assert all(exc is view_exc for _, exc in calls)


def test_teardown_request_continues_when_one_raises(app, client):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    view_exc = ValueError("view error")
    teardown_exc = RuntimeError("teardown failure")
    calls = []

    @app.teardown_request
    def teardown_1(exc):
        calls.append(("teardown_1", exc))

    @app.teardown_request
    def teardown_2(exc):
        calls.append(("teardown_2", exc))
        raise teardown_exc

    @app.teardown_request
    def teardown_3(exc):
        calls.append(("teardown_3", exc))

    @app.route("/")
    def index():
        raise view_exc

    with pytest.raises(ExceptionGroup, match="Errors during context teardown") as exc_info:
        client.get("/")

    assert calls == [
        ("teardown_3", view_exc),
        ("teardown_2", view_exc),
        ("teardown_1", view_exc),
    ]
    assert all(exc is view_exc for _, exc in calls)
    assert len(exc_info.value.exceptions) == 1
    req_eg = exc_info.value.exceptions[0]
    assert isinstance(req_eg, ExceptionGroup)
    assert req_eg.message == "Errors during request teardown"
    assert req_eg.exceptions == (teardown_exc,)

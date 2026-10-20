import pytest
from flask import Flask

def test_teardown_request_exception_handling(app, client):
    """
    Verify that teardown_request functions are called in reverse
    registration order and receive the exception from the view,
    and that if one teardown function raises an exception, the
    others still run.
    """
    app.config['PROPAGATE_EXCEPTIONS'] = False
    teardown_log = []

    @app.teardown_request
    def teardown1(exc):
        teardown_log.append(('teardown1', exc))

    @app.teardown_request
    def teardown2(exc):
        teardown_log.append(('teardown2', exc))
        raise RuntimeError("Teardown error")

    @app.teardown_request
    def teardown3(exc):
        teardown_log.append(('teardown3', exc))

    @app.route('/')
    def index():
        raise ValueError("View error")

    with pytest.raises(RuntimeError):
        client.get('/')

    assert len(teardown_log) == 2
    assert teardown_log[0][0] == 'teardown3'
    assert isinstance(teardown_log[0][1], ValueError)
    assert str(teardown_log[0][1]) == "View error"

    assert teardown_log[1][0] == 'teardown2'
    assert isinstance(teardown_log[1][1], ValueError)
    assert str(teardown_log[1][1]) == "View error"

    assert 'teardown1' not in [x[0] for x in teardown_log]

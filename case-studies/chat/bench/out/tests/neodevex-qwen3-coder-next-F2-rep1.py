import pytest

import flask


def test_teardown_reverse_order_with_exception(app, client):
    """Test that teardown_request functions run in reverse registration order
    and each receives the exception raised by the view when PROPAGATE_EXCEPTIONS=False."""
    
    # Disable PROPAGATE_EXCEPTIONS explicitly
    app.config["PROPAGATE_EXCEPTIONS"] = False
    app.testing = False  # Ensure exceptions don't propagate
    
    order = []
    
    @app.teardown_request
    def teardown1(exc):
        order.append(1)
        # Verify that we receive the exception raised by the view
        assert exc is not None
        assert type(exc) is ValueError
        assert str(exc) == "test exception"
    
    @app.teardown_request
    def teardown2(exc):
        order.append(2)
        # Verify that we receive the same exception
        assert exc is not None
        assert type(exc) is ValueError
        assert str(exc) == "test exception"
    
    @app.teardown_request
    def teardown3(exc):
        order.append(3)
        # Verify that we receive the same exception
        assert exc is not None
        assert type(exc) is ValueError
        assert str(exc) == "test exception"
    
    @app.route("/")
    def index():
        raise ValueError("test exception")
    
    rv = client.get("/")
    assert rv.status_code == 500
    
    # Teardown functions should run in reverse registration order: 3, 2, 1
    assert order == [3, 2, 1]


def test_teardown_still_runs_after_error(app, client):
    """Test that if one teardown_request function raises, the remaining
    teardown_request functions still run."""
    
    # Disable PROPAGATE_EXCEPTIONS explicitly
    app.config["PROPAGATE_EXCEPTIONS"] = False
    app.testing = False
    
    order = []
    
    @app.teardown_request
    def teardown1(exc):
        order.append(1)
        # First teardown runs successfully
    
    @app.teardown_request
    def teardown2(exc):
        order.append(2)
        # Second teardown raises an exception
        raise RuntimeError("teardown error")
    
    @app.teardown_request
    def teardown3(exc):
        order.append(3)
        # Third teardown should still run even though teardown2 raised
    
    @app.teardown_request
    def teardown4(exc):
        order.append(4)
        # Fourth teardown should also run
    
    @app.route("/")
    def index():
        raise ValueError("test exception")
    
    import sys
    
    if sys.version_info >= (3, 11):
        import pytest
        
        with pytest.raises(ExceptionGroup, match="context teardown"):  # noqa: F821
            client.get()
    else:
        with pytest.raises(RuntimeError, match="teardown error"):
            client.get()
    
    # All teardown functions should have run in reverse order: 4, 3, 2, 1
    assert order == [4, 3, 2, 1]

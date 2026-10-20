"""Tests for teardown_request behavior with exceptions."""

import sys
import pytest
import flask
from flask.testing import FlaskClient


def test_teardown_request_order_and_exception_passing(app, client):
    """Test that teardown_request functions run in reverse order and receive the exception."""
    
    # Set PROPAGATE_EXCEPTIONS to False to ensure exception is wrapped
    app.config["PROPAGATE_EXCEPTIONS"] = False
    
    # Track execution order and exceptions received
    execution_order = []
    exceptions_received = []
    
    @app.teardown_request
    def first_teardown(exc):
        execution_order.append("first")
        exceptions_received.append(exc)
        return "ignored"
    
    @app.teardown_request
    def second_teardown(exc):
        execution_order.append("second")
        exceptions_received.append(exc)
        return "ignored"
    
    @app.teardown_request
    def third_teardown(exc):
        execution_order.append("third")
        exceptions_received.append(exc)
        return "ignored"
    
    @app.route("/")
    def index():
        raise ZeroDivisionError("test error")
    
    # Make the request and expect a 500 error
    rv = client.get("/")
    assert rv.status_code == 500
    
    # Verify execution order (should be reversed: third, second, first)
    assert execution_order == ["third", "second", "first"], \
        f"Expected reverse order but got {execution_order}"
    
    # Verify all teardowns received the same exception
    assert len(exceptions_received) == 3
    for exc in exceptions_received:
        # The exception should be ZeroDivisionError, not InternalServerError
        assert type(exc) is ZeroDivisionError, \
            f"Expected ZeroDivisionError but got {type(exc)}"


def test_teardown_request_continues_on_error(app, client):
    """Test that if one teardown_request function raises, others still run."""
    
    # Set PROPAGATE_EXCEPTIONS to False
    app.config["PROPAGATE_EXCEPTIONS"] = False
    
    execution_order = []
    
    @app.teardown_request
    def first_teardown(exc):
        execution_order.append("first")
        return "ignored"
    
    @app.teardown_request
    def second_teardown(exc):
        execution_order.append("second")
        # This teardown raises an exception
        raise ValueError("second teardown failed")
    
    @app.teardown_request
    def third_teardown(exc):
        execution_order.append("third")
        return "ignored"
    
    @app.route("/")
    def index():
        raise ZeroDivisionError("test error")
    
    # Make the request - should still execute all teardowns
    # In Python 3.11+, exceptions are collected as ExceptionGroup
    if sys.version_info >= (3, 11):
        # Python 3.11+
        with pytest.raises(ExceptionGroup) as exc_info:
            client.get("/")
        # Verify all teardowns ran by checking the exceptions in the group
        exceptions = exc_info.value.exceptions
        # The first exception should be from second_teardown
        # The third_teardown and first_teardown should also have run
        # We can verify execution order by the exception type
        assert len(exceptions) >= 1
    else:
        # Python 3.10 and earlier - only first exception is raised
        with pytest.raises(ValueError, match="second teardown failed"):
            client.get("/")
    
    # All teardowns should have run (third, second, first)
    assert execution_order == ["third", "second", "first"], \
        f"Expected all teardowns to run but got {execution_order}"


def test_teardown_request_exception_propagation(app, client):
    """Test that exceptions from teardown_request are properly collected and raised."""
    
    # Set PROPAGATE_EXCEPTIONS to False
    app.config["PROPAGATE_EXCEPTIONS"] = False
    
    @app.teardown_request
    def teardown_with_error(exc):
        raise ValueError("teardown error")
    
    @app.route("/")
    def index():
        return "OK"
    
    # When a teardown raises, it should be collected and re-raised
    # In Python 3.11+ this will be a BaseExceptionGroup, in older versions the first error
    if sys.version_info >= (3, 11):
        # Python 3.11+ BaseExceptionGroup
        with pytest.raises(ExceptionGroup) as exc_info:
            client.get("/")
        # Check the nested ExceptionGroup for the teardown error
        outer_exceptions = exc_info.value.exceptions
        assert len(outer_exceptions) == 1
        inner_exception_group = outer_exceptions[0]
        # Get the inner exception from the group
        inner_exceptions = inner_exception_group.exceptions
        assert len(inner_exceptions) == 1
        assert "teardown error" in str(inner_exceptions[0])
    else:
        # Python 3.10 and earlier, single exception
        with pytest.raises(ValueError, match="teardown error"):
            client.get("/")


def test_teardown_request_multiple_failures(app, client):
    """Test that multiple teardown failures are all collected."""
    
    # Set PROPAGATE_EXCEPTIONS to False
    app.config["PROPAGATE_EXCEPTIONS"] = False
    
    @app.teardown_request
    def first_teardown(exc):
        raise ValueError("first error")
    
    @app.teardown_request
    def second_teardown(exc):
        raise RuntimeError("second error")
    
    @app.teardown_request
    def third_teardown(exc):
        raise TypeError("third error")
    
    @app.route("/")
    def index():
        return "OK"
    
    # All teardowns should run and their exceptions should be collected
    if sys.version_info >= (3, 11):
        # Python 3.11+ BaseExceptionGroup
        with pytest.raises(ExceptionGroup) as exc_info:
            client.get("/")
        
        # The outer ExceptionGroup has 1 item which is an inner ExceptionGroup
        # with all 3 teardown exceptions
        outer_exceptions = exc_info.value.exceptions
        assert len(outer_exceptions) == 1
        
        inner_exception_group = outer_exceptions[0]
        if hasattr(inner_exception_group, "exceptions"):
            # Python 3.11+ has nested ExceptionGroups
            errors = inner_exception_group.exceptions
            assert len(errors) == 3, f"Expected 3 errors but got {len(errors)}"
            error_messages = [str(e) for e in errors]
            assert "first error" in error_messages
            assert "second error" in error_messages
            assert "third error" in error_messages
        else:
            # In case it's a single exception
            assert str(inner_exception_group) == "first error"
    else:
        # Python 3.10 and earlier, only first exception is raised
        with pytest.raises(ValueError, match="first error"):
            client.get("/")

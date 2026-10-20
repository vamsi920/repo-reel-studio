import pytest

import flask


def test_teardown_reverse_order_and_exception_passing(app, client):
    """Test that teardown_request functions run in reverse registration order
    and each receives the exception the view raised when PROPAGATE_EXCEPTIONS=False.
    """
    app.config["PROPAGATE_EXCEPTIONS"] = False

    # Track execution order and exceptions received
    records = []

    @app.teardown_request
    def first_teardown(exc):
        records.append(("first", exc))
        # First teardown should receive the ZeroDivisionError
        assert isinstance(exc, ZeroDivisionError)

    @app.teardown_request
    def second_teardown(exc):
        records.append(("second", exc))
        # Second teardown should also receive the ZeroDivisionError
        assert isinstance(exc, ZeroDivisionError)

    @app.teardown_request
    def third_teardown(exc):
        records.append(("third", exc))
        # Third teardown should also receive the ZeroDivisionError
        assert isinstance(exc, ZeroDivisionError)

    @app.route("/")
    def view():
        raise ZeroDivisionError("test exception")

    # Suppress the exception logging
    import logging
    logging.getLogger("flask").setLevel(logging.ERROR)

    client.get("/")

    # Check execution order - should be reverse registration order (third, second, first)
    assert len(records) == 3
    assert records[0][0] == "third"
    assert records[1][0] == "second"
    assert records[2][0] == "first"

    # Check that all received the exception
    for name, exc in records:
        assert isinstance(exc, ZeroDivisionError)
        assert str(exc) == "test exception"


def test_teardown_continues_on_error(app, client):
    """Test that if one teardown_request function raises, the remaining
    teardown_request functions still run when PROPAGATE_EXCEPTIONS=False.
    
    The _CollectErrors context manager ensures all teardown functions run
    even if some raise exceptions. The collected exceptions are re-raised
    as a BaseExceptionGroup after all teardowns complete.
    """
    app.config["PROPAGATE_EXCEPTIONS"] = False

    # Track which teardowns were called
    called = []

    @app.teardown_request
    def first_teardown(exc):
        called.append("first")
        # This teardown raises an exception
        raise RuntimeError("first teardown failed")

    @app.teardown_request
    def second_teardown(exc):
        called.append("second")
        # This should still be called even though first teardown raised

    @app.teardown_request
    def third_teardown(exc):
        called.append("third")
        # This should also be called

    @app.route("/")
    def view():
        raise ValueError("view exception")

    # Suppress the exception logging
    import logging
    logging.getLogger("flask").setLevel(logging.ERROR)

    # All teardowns run before exceptions are re-raised.
    # With Python 3.11+, we get an ExceptionGroup. With older versions,
    # only the first error is raised. We catch and verify all teardowns ran.
    import sys
    import pytest
    if sys.version_info >= (3, 11):
        with pytest.raises(BaseExceptionGroup, match="Errors during context teardown"):
            client.get("/")
    else:
        with pytest.raises(RuntimeError, match="first teardown failed"):
            client.get("/")

    # Verify all three teardowns were called (in reverse registration order)
    # Teardowns execute in reverse order: last registered first executed
    # The called list should be populated even though an exception was raised
    assert called == ["third", "second", "first"]

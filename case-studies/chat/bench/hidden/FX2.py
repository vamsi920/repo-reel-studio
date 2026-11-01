import flask


def _app():
    app = flask.Flask(__name__)
    calls = []
    parent = flask.Blueprint("parent", __name__, url_prefix="/p")
    child = flask.Blueprint("child", __name__, url_prefix="/c")
    grand = flask.Blueprint("grand", __name__, url_prefix="/g")

    @app.before_request
    def app_before():
        calls.append("app")

    @parent.before_request
    def parent_before():
        calls.append("parent")

    @child.before_request
    def child_before():
        calls.append("child")

    @grand.before_request
    def grand_before():
        calls.append("grand")

    @parent.errorhandler(418)
    def teapot(e):
        return "parent handled", 200

    @parent.context_processor
    def ctx():
        return {"who": "parent-ctx"}

    @child.route("/")
    def child_index():
        return "child"

    @child.route("/tea")
    def child_tea():
        flask.abort(418)

    @child.route("/tpl")
    def child_tpl():
        return flask.render_template_string("{{ who }}")

    @grand.route("/")
    def grand_index():
        return "grand"

    child.register_blueprint(grand)
    parent.register_blueprint(child)
    app.register_blueprint(parent)
    return app, calls


def test_parent_before_request_runs_for_child():
    app, calls = _app()
    assert app.test_client().get("/p/c/").data == b"child"
    assert calls == ["app", "parent", "child"]


def test_all_ancestors_run_for_grandchild():
    app, calls = _app()
    assert app.test_client().get("/p/c/g/").data == b"grand"
    assert calls == ["app", "parent", "child", "grand"]


def test_parent_errorhandler_applies_to_child():
    app, _ = _app()
    rv = app.test_client().get("/p/c/tea")
    assert rv.status_code == 200
    assert rv.data == b"parent handled"


def test_parent_context_processor_applies_to_child():
    app, _ = _app()
    assert app.test_client().get("/p/c/tpl").data == b"parent-ctx"

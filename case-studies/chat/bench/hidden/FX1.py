import flask


def _clear(monkeypatch):
    import os

    for key in list(os.environ):
        if key.startswith("FLASK_"):
            monkeypatch.delenv(key)


def test_three_levels(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("FLASK_DB__OPTIONS__TIMEOUT", "5")
    app = flask.Flask(__name__)
    app.config.from_prefixed_env()
    assert app.config["DB"] == {"OPTIONS": {"TIMEOUT": 5}}


def test_four_levels_keep_existing(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("FLASK_A__B__C__D", '"x"')
    app = flask.Flask(__name__)
    app.config["A"] = {"keep": 1, "B": {"other": 2}}
    app.config.from_prefixed_env()
    assert app.config["A"] == {"keep": 1, "B": {"other": 2, "C": {"D": "x"}}}


def test_two_levels(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("FLASK_X__Y", "true")
    app = flask.Flask(__name__)
    app.config.from_prefixed_env()
    assert app.config["X"] == {"Y": True}

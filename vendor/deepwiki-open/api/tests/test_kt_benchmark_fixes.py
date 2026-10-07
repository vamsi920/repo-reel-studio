"""Regression tests for the gaps found benchmarking KT docs against DeepWiki."""

import os
import subprocess

import pytest

from api.config import iterate_files
from api.repository import Repo
from api.services.wiki.content import RepoUrlContext, generate_file_url
from api.services.wiki.mermaid_sanitize import sanitize_mermaid, sanitize_mermaid_blocks
from api.services.wiki.prompts import comprehensive_page_range
from api.usage import UsageMeter, price_call


# --- Mermaid sanitizer ------------------------------------------------------


@pytest.mark.parametrize(
    "line, expected",
    [
        ("    A[compose(middleware)] --> B{dispatch(0)};", '    A["compose(middleware)"] --> B{"dispatch(0)"};'),
        ('    A[get_source("t.html")] --> B', '    A["get_source(#quot;t.html#quot;)"] --> B'),
        ("    E{User submits form (POST)};", '    E{"User submits form (POST)"};'),
    ],
)
def test_quotes_flowchart_labels_with_delimiters(line, expected):
    assert sanitize_mermaid("graph TD\n" + line).split("\n")[1] == expected


@pytest.mark.parametrize(
    "line",
    [
        '    Api1["ky.create({prefixUrl: \'api1.com\'})"]',
        '    R["@bp.route(\'/users/<id>\')"]',
        "    A[Plain label] --> B{Is it ok?}",
        '    G["CSRF tokens\\n(no built-in; use extensions)"]',
    ],
)
def test_leaves_valid_flowchart_labels_alone(line):
    body = "flowchart TD\n" + line
    assert sanitize_mermaid(body) == body


def test_drops_unbalanced_sequence_activations():
    body = (
        "sequenceDiagram\n"
        "    participant App\n"
        "    App->>+Ctx: push()\n"
        "    Ctx-->>-App: done\n"
        "    deactivate App\n"
    )
    fixed = sanitize_mermaid(body)
    assert "->>+" not in fixed and "-->>-" not in fixed
    assert "deactivate" not in fixed
    assert "App->>Ctx: push()" in fixed


def test_aliases_participants_with_punctuation():
    body = "sequenceDiagram\n    participant render_template()\n    View->>render_template(): call\n"
    fixed = sanitize_mermaid(body)
    assert "participant render_template as render_template()" in fixed
    assert "View->>render_template: call" in fixed


def test_only_touches_mermaid_fences():
    md = "Text A[compose(x)]\n\n```mermaid\ngraph TD\n    A[f(x)]\n```\n"
    out = sanitize_mermaid_blocks(md)
    assert out.startswith("Text A[compose(x)]")
    assert 'A["f(x)"]' in out


# --- File selection ---------------------------------------------------------


def _git_repo(root, files):
    for rel, text in files.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(text)
    subprocess.run(["git", "init", "-q", root], check=True)
    subprocess.run(["git", "-C", root, "add", "-A"], check=True)


def test_indexes_manifests_ci_and_tracked_build_dir(tmp_path):
    root = str(tmp_path / "repo")
    _git_repo(
        root,
        {
            "pyproject.toml": "[project]\n",
            "tox.ini": "[tox]\n",
            ".github/workflows/ci.yml": "on: push\n",
            "build/build.ts": "export {}\n",
            "vitest.config.mts": "export default {}\n",
            "src/app.py": "x = 1\n",
        },
    )
    # Untracked build output must still be skipped.
    os.makedirs(os.path.join(root, "dist"))
    open(os.path.join(root, "dist", "bundle.js"), "w").write("x")
    files = set(iterate_files(root))
    assert {"pyproject.toml", "tox.ini", ".github/workflows/ci.yml", "build/build.ts", "vitest.config.mts", "src/app.py"} <= files
    assert "dist/bundle.js" not in files


def test_ancestor_directory_names_do_not_exclude_files(tmp_path):
    root = tmp_path / "tmp" / "build" / "project"
    (root / "src").mkdir(parents=True)
    (root / "src" / "main.py").write_text("x = 1\n")
    assert iterate_files(str(root)) == ["src/main.py"]


def test_local_repos_with_same_basename_get_distinct_names(tmp_path):
    a = Repo(str(tmp_path / "one" / "project"), "local")
    b = Repo(str(tmp_path / "two" / "project"), "local")
    assert a.name != b.name
    assert a.name.startswith("project_")


# --- Links, page counts, cost -----------------------------------------------


def test_file_links_use_the_given_ref():
    ctx = RepoUrlContext(type="github", repo_url="https://github.com/o/r", default_branch="abc123")
    assert generate_file_url("src/a.ts", ctx) == "https://github.com/o/r/blob/abc123/src/a.ts"


def test_page_range_scales_with_repo_size():
    small = comprehensive_page_range(True, None, 60)
    large = comprehensive_page_range(True, None, 450)
    assert small == "16-24"
    assert int(large.split("-")[0]) >= 50
    assert comprehensive_page_range(False, None, 450) == "4-6"


def test_cost_includes_thinking_tokens_and_long_context_tier():
    meter = UsageMeter()
    meter.record("gemini-2.5-pro", 100_000, 1_000, 2_000)
    assert meter.to_dict()["total_cost_usd"] == pytest.approx((100_000 * 1.25 + 3_000 * 10) / 1e6)
    assert price_call("gemini-2.5-pro", 300_000, 0) == pytest.approx(300_000 * 2.5 / 1e6)


def test_unknown_models_are_flagged_not_priced_as_free():
    meter = UsageMeter()
    meter.record("mystery-model", 10, 10)
    d = meter.to_dict()
    assert d["has_unpriced_calls"] is True
    assert d["models"]["mystery-model"]["unpriced_calls"] == 1


# --- Coverage pass ------------------------------------------------------------


def test_coverage_pass_attaches_nearby_files_and_groups_the_rest():
    from api.schemas import WikiPage, WikiSection, WikiStructureModel
    from api.services.wiki.coverage import ensure_file_coverage

    page = WikiPage(id="core", title="Core", content="", filePaths=["src/core/app.ts"], importance="high", relatedPages=[])
    structure = WikiStructureModel(
        id="w", title="W", description="", pages=[page],
        sections=[WikiSection(id="s1", title="S", pages=["core"])], rootSections=["s1"],
    )
    files = ["src/core/app.ts", "src/core/router.ts", "src/middleware/cors.ts", "README.md", "package.json"]
    attached = ensure_file_coverage(structure, files)
    assert "src/core/router.ts" in page.filePaths
    assert set(attached) == {"src/core/router.ts", "src/middleware/cors.ts", "package.json"}
    ref_pages = [p for p in structure.pages if p.id != "core"]
    assert any("src/middleware/cors.ts" in p.filePaths for p in ref_pages)
    assert structure.sections[-1].pages == [p.id for p in ref_pages]
    assert "README.md" not in {f for p in structure.pages for f in p.filePaths}


# --- Stream errors never become page content -----------------------------------


def _failing_chat(monkeypatch):
    import api.services.research as research

    class _Memory(dict):
        def __call__(self):
            return {}

    class _Rag:
        memory = _Memory()

    class _Failing:
        provider = "google"
        error_hint = None

        async def respond_stream(self, prompt):
            raise RuntimeError("Stream removed")
            yield ""  # pragma: no cover

    async def _prep(request):
        return _Rag()

    monkeypatch.setattr(research, "prepare_repo_index", _prep)
    monkeypatch.setattr(research.ChatStreamer, "create", staticmethod(lambda **_: _Failing()))
    monkeypatch.setattr(research, "repo_index_exist", lambda repo: True)
    return research


def _request():
    from api.schemas import ChatCompletionRequest, ChatMessage

    return ChatCompletionRequest(
        repo_url="https://github.com/o/r", type="github", provider="google",
        model="gemini-2.5-pro", messages=[ChatMessage(role="user", content="q")],
    )


@pytest.mark.asyncio
async def test_generation_stream_errors_raise(monkeypatch):
    research = _failing_chat(monkeypatch)
    stream = await research.research_chat(_request(), skip_rag=True, raise_errors=True)
    with pytest.raises(RuntimeError, match="Stream removed"):
        async for _ in stream:
            pass


@pytest.mark.asyncio
async def test_chat_stream_errors_still_reach_the_user(monkeypatch):
    research = _failing_chat(monkeypatch)
    stream = await research.research_chat(_request(), skip_rag=True)
    text = "".join([c async for c in stream])
    assert "Error with google API: Stream removed" in text


def test_workflow_files_get_their_own_page():
    from api.schemas import WikiPage, WikiStructureModel
    from api.services.wiki.coverage import WORKFLOW_PAGE_ID, ensure_file_coverage

    core = WikiPage(id="core", title="Core", content="", filePaths=["src/app.ts"], importance="high", relatedPages=[])
    structure = WikiStructureModel(id="w", title="W", description="", pages=[core])
    files = ["src/app.ts", "package.json", ".github/workflows/ci.yml", "vitest.config.ts", "src/util.ts"]
    ensure_file_coverage(structure, files)
    workflow = next(p for p in structure.pages if p.id == WORKFLOW_PAGE_ID)
    assert workflow.filePaths == ["package.json", "vitest.config.ts", ".github/workflows/ci.yml"]


@pytest.mark.asyncio
async def test_stream_failure_before_output_is_retried(monkeypatch):
    research = _failing_chat(monkeypatch)
    calls = {"n": 0}

    class _FlakyOnce:
        provider = "google"
        error_hint = None

        async def respond_stream(self, prompt):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("Stream removed")
            yield "answer"

    monkeypatch.setattr(research.ChatStreamer, "create", staticmethod(lambda **_: _FlakyOnce()))
    async def _no_wait(*_):
        return None

    monkeypatch.setattr(research.asyncio, "sleep", _no_wait)
    stream = await research.research_chat(_request(), skip_rag=True, raise_errors=True)
    assert "".join([c async for c in stream]) == "answer"
    assert calls["n"] == 2


@pytest.mark.parametrize(
    "title, is_workflow",
    [
        ("Development workflow: build, test, lint and CI", True),
        ("Testing and CI", True),
        ("URL Building with url_for", False),
        ("Testing utilities", False),
    ],
)
def test_workflow_page_detection_needs_workflow_intent(title, is_workflow):
    from api.services.wiki.coverage import _WORKFLOW_TITLE

    assert bool(_WORKFLOW_TITLE.search(title)) is is_workflow


def test_uncited_files_lists_page_files_the_text_never_cites():
    from api.services.wiki.tasks import uncited_files

    content = (
        "<details>\n- [src/c.py](https://x/src/c.py)\n</details>\n"
        "Retries happen here. Sources: [src/a.py:1-3](), [src/b.py]()"
    )
    assert uncited_files(content, ["src/a.py", "src/b.py", "src/c.py"]) == ["src/c.py"]

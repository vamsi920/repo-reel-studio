"""Make sure every source file reaches at least one wiki page.

The structure step lets the model pick ~5 files per page. Benchmarked
against DeepWiki on ky / flask / hono, that left most of each repository
undocumented: our wikis cited 20-33 distinct files where DeepWiki cited
55-183, and onboarding questions about the skipped modules came back
"not covered". This pass is deterministic: it attaches every uncovered
source file to the page whose files live closest to it in the tree, and
groups whatever is left into reference pages by directory.
"""

from __future__ import annotations

import os
import re
from collections import defaultdict

from api.schemas import WikiPage, WikiSection, WikiStructureModel

MAX_FILES_PER_PAGE = 8
MAX_EXTRA_PAGES = 24
REFERENCE_SECTION_ID = "section-module-reference"

_SOURCE_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".go", ".rs",
    ".java", ".kt", ".kts", ".scala", ".rb", ".php", ".cs", ".swift", ".c", ".h", ".cpp",
    ".hpp", ".vue", ".svelte", ".dart", ".ex", ".exs", ".lua", ".zig", ".sql", ".sh",
    ".toml", ".ini", ".cfg", ".yml", ".yaml",
}
_MANIFESTS = {"package.json", "pyproject.toml", "Cargo.toml", "go.mod", "tsconfig.json", "deno.json", "jsr.json"}
_SKIP = re.compile(r"(^|/)(\.changeset|\.husky|benchmarks?|examples?|fixtures?|__snapshots__)/|\.d\.ts$|(^|/)\.github/(ISSUE_TEMPLATE|FUNDING)")


def is_source(path: str) -> bool:
    name = os.path.basename(path)
    if name in _MANIFESTS:
        return True
    if _SKIP.search(path):
        return False
    return os.path.splitext(path)[1].lower() in _SOURCE_EXTENSIONS


def _closeness(a: str, b: str) -> int:
    """Shared leading directory components, +1 when stems overlap."""
    da, db = a.split("/")[:-1], b.split("/")[:-1]
    shared = 0
    for x, y in zip(da, db):
        if x != y:
            break
        shared += 1
    stem_a = re.split(r"[._-]", os.path.basename(a))[0].lower()
    stem_b = re.split(r"[._-]", os.path.basename(b))[0].lower()
    return shared * 2 + (1 if stem_a and stem_a == stem_b else 0)


def _group_key(path: str) -> str:
    parts = path.split("/")[:-1]
    if not parts:
        return "(root)"
    # "src/foo/bar.ts" groups by "src/foo"; "lib/x.py" by "lib".
    return "/".join(parts[:2]) if parts[0] in {"src", "lib", "packages", "pkg", "internal", "app"} and len(parts) > 1 else parts[0]


_WORKFLOW = re.compile(
    r"(^|/)(package\.json|pyproject\.toml|setup\.cfg|tox\.ini|noxfile\.py|Makefile|"
    r"tsconfig[^/]*\.json|(vitest|jest|vite|eslint|prettier|rollup|tsup|babel)[^/]*\.(c|m)?(js|ts)|"
    r"\.pre-commit-config\.yaml|jsr\.json|deno\.json|Cargo\.toml|go\.mod)$"
    r"|^\.github/workflows/"
)
# Whole-title intent, not a substring: "URL Building with url_for" is not a
# workflow page, but it matched a bare `build` and swallowed flask's CI files.
_WORKFLOW_TITLE = re.compile(
    r"\b(development|developer|dev)\b.*\b(workflow|setup|guide|environment)\b"
    r"|\b(build|test(ing)?|ci|lint(ing)?|release)\b.*\b(and|&|,)\b.*\b(test(ing)?|ci|lint(ing)?|release|tooling)\b"
    r"|\bcontributing\b|\bci/cd\b|\bcontinuous integration\b",
    re.I,
)
WORKFLOW_PAGE_ID = "development-workflow"
MAX_WORKFLOW_FILES = 14


def ensure_workflow_page(structure: WikiStructureModel, file_paths: list[str]) -> list[str]:
    """Guarantee one page owns the build/test/lint/CI files.

    Benchmarked: dev-workflow questions were the weakest docs category
    (42% vs DeepWiki's 62%) because manifests and CI files ended up spread
    across generic reference pages or on no page at all.
    """
    workflow = [p for p in sorted(file_paths) if _WORKFLOW.search(p) and not _SKIP.search(p)]
    if len(workflow) < 2:
        return []
    page = next((p for p in structure.pages if _WORKFLOW_TITLE.search(p.title)), None)
    if page is None:
        page = WikiPage(
            id=WORKFLOW_PAGE_ID, title="Development workflow: build, test, lint and CI", content="",
            filePaths=[], importance="medium", relatedPages=[],
            description="Exact commands, tools, runtime versions, test configuration, lint/type-check setup, CI matrix and release process, from the manifests and workflow files.",
        )
        structure.pages.append(page)
        if structure.sections:
            structure.sections[-1].pages.append(page.id)
    # Root manifests first, then CI workflows, then tool configs.
    rank = lambda p: (p.count("/"), not p.startswith(".github"), p)  # noqa: E731
    added = []
    for path in sorted(workflow, key=rank):
        if len(page.filePaths) >= MAX_WORKFLOW_FILES:
            break
        if path not in page.filePaths:
            page.filePaths.append(path)
            added.append(path)
    return added


def ensure_file_coverage(structure: WikiStructureModel, file_paths: list[str]) -> list[str]:
    """Mutates ``structure`` in place. Returns the files that were attached."""
    ensure_workflow_page(structure, file_paths)
    pages = structure.pages
    covered = {p for page in pages for p in page.filePaths}
    uncovered = sorted(p for p in file_paths if is_source(p) and p not in covered)
    attached: list[str] = []
    leftovers: list[str] = []
    for path in uncovered:
        best, best_score = None, 0
        for page in pages:
            if len(page.filePaths) >= MAX_FILES_PER_PAGE:
                continue
            # Only pages documenting the same module directory qualify:
            # sharing just "src/" says nothing about what a file is for.
            score = max(
                (_closeness(path, f) for f in page.filePaths if _group_key(f) == _group_key(path)),
                default=0,
            )
            if score > best_score:
                best, best_score = page, score
        # Require a shared directory below the root (score >= 2) so a file
        # isn't bolted onto an unrelated page just because both are top-level.
        if best is not None and best_score >= 2:
            best.filePaths.append(path)
            attached.append(path)
        else:
            leftovers.append(path)

    groups: dict[str, list[str]] = defaultdict(list)
    for path in leftovers:
        groups[_group_key(path)].append(path)
    extra: list[WikiPage] = []
    existing_ids = {p.id for p in pages}
    for key, files in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        for i in range(0, len(files), MAX_FILES_PER_PAGE):
            if len(extra) >= MAX_EXTRA_PAGES:
                break
            chunk = files[i : i + MAX_FILES_PER_PAGE]
            label = key if key != "(root)" else "Repository root"
            suffix = f" (part {i // MAX_FILES_PER_PAGE + 1})" if len(files) > MAX_FILES_PER_PAGE else ""
            pid = re.sub(r"[^a-z0-9]+", "-", f"ref-{key}-{i}".lower()).strip("-")
            while pid in existing_ids:
                pid += "-x"
            existing_ids.add(pid)
            extra.append(WikiPage(
                id=pid,
                title=f"{label}: module reference{suffix}",
                content="",
                filePaths=chunk,
                importance="low",
                relatedPages=[],
                description=(
                    f"Reference for the files under {label} that the other pages do not cover: "
                    "what each one is for, its main exports, and how it connects to the rest of the codebase."
                ),
            ))
            attached.extend(chunk)
    if extra:
        pages.extend(extra)
        if structure.sections is not None:
            structure.sections.append(WikiSection(
                id=REFERENCE_SECTION_ID, title="Module reference", pages=[p.id for p in extra],
            ))
            if structure.rootSections is not None:
                structure.rootSections.append(REFERENCE_SECTION_ID)
    return attached

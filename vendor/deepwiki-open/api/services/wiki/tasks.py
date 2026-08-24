import os
import re
import asyncio
from typing import Callable, Any
from collections.abc import Coroutine
import time
from pydantic import BaseModel, Field, computed_field, ConfigDict

from api.utils import deepwiki_root
from api.schemas import (
    ChatMessage,
    ChatCompletionRequest,
    WikiCacheData,
    WikiTaskRequest,
    WikiStructureModel,
    WikiTaskStatus,
    WikiTaskSubmitResult,
    WikiTaskSummary,
    WikiPage,
    RepoInfo,
    TaskStatus,
)
from api.repository import Repo
from api.rag import repo_index_exist, count_tokens
from api.services.codemap import read_repo_file
from api.services.research import prepare_repo_index, research_chat
from api.services.wiki import (
    save_wiki_cache,
    wiki_cache_exists,
)
from api.services.wiki.content import (
    RepoUrlContext,
    generate_file_url,
    post_process_wiki_content,
)

from api.services.wiki.structure import (
    detect_default_branch,
    read_repo_file_tree,
    parse_wiki_structure,
)

from api.services.wiki.prompts import (
    build_page_prompt,
    build_structure_prompt,
)

from api.logger import get_logger

logger = get_logger(__name__)


def _env_int(name, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


WIKI_CACHE_DIR = os.path.join(deepwiki_root(), "wikicache")
os.makedirs(WIKI_CACHE_DIR, exist_ok=True)
# Concurrent repo tasks (the "pool size"). Default: half the CPU cores, min 1.
MAX_CONCURRENT_WIKI_TASKS = _env_int(
    "DEEPWIKI_MAX_CONCURRENT_WIKI_TASKS", max(1, (os.cpu_count() or 2) // 2)
)
# Concurrent page generations within a single task (1 == sequential, as today).
WIKI_PAGE_CONCURRENCY = _env_int("DEEPWIKI_WIKI_PAGE_CONCURRENCY", 1)
# Retries per page for transient errors before falling back to an error placeholder.
WIKI_PAGE_RETRIES = _env_int("DEEPWIKI_WIKI_PAGE_RETRIES", 2)
# How long a terminal (COMPLETED/FAILED) task lingers in the registry.
WIKI_TASK_TTL_SECONDS = _env_int("DEEPWIKI_WIKI_TASK_TTL_SECONDS", 300)


class WikiTask(BaseModel):
    """In-memory runtime state for one repo's generation task."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    request: WikiTaskRequest
    status: TaskStatus = TaskStatus.PENDING
    pages_done: int = 0
    current_page_ids: list[str] = Field(default_factory=list)
    wiki_structure: WikiStructureModel | None = None
    default_branch: str = "main"  # set by determine_structure; used for file URLs
    error: str | None = None
    submitted_at: int = Field(default_factory=lambda: int(time.time() * 1000))
    task: asyncio.Task | None = Field(default=None, repr=False)

    @computed_field
    @property
    def pages_total(self) -> int:
        if self.wiki_structure is not None:
            return len(self.wiki_structure.pages)
        return 0

    @classmethod
    def from_wiki_request(cls, request: WikiTaskRequest) -> "WikiTask":
        return cls(
            request=request,
        )

    @property
    def repo_key(self) -> str:
        return self.request.repo_key

    def to_status(self) -> WikiTaskStatus:
        """Client-facing status (SPEC.md §9). Never exposes the token."""
        r = self.request
        return WikiTaskStatus(
            id=self.repo_key,
            owner=r.owner,
            repo=r.repo,
            repo_type=r.type,
            language=r.language,
            status=self.status,
            pages_done=self.pages_done,
            pages_total=self.pages_total,
            current_page_ids=self.current_page_ids,
            wiki_structure=self.wiki_structure,
            error=self.error,
            submitted_at=self.submitted_at,
        )

    def to_summary(self) -> WikiTaskSummary:
        r = self.request
        return WikiTaskSummary(
            id=self.repo_key,
            owner=r.owner,
            repo=r.repo,
            repo_type=r.type,
            language=r.language,
            status=self.status,
            pages_done=self.pages_done,
            pages_total=self.pages_total,
            current_page_ids=self.current_page_ids,
            error=self.error,
            submitted_at=self.submitted_at,
        )


class TaskRegistry:
    _tasks: dict[str, WikiTask]
    _lock: asyncio.Lock
    _semaphore: asyncio.Semaphore

    def __init__(self, max_concurrent: int = MAX_CONCURRENT_WIKI_TASKS):
        self._tasks = {}
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(max_concurrent)

    def get(self, id: str) -> WikiTask | None:
        return self._tasks.get(id)

    def active(self) -> list[WikiTask]:
        return [w for w in self._tasks.values() if not w.status.is_terminal()]

    async def remove(self, id: str) -> WikiTask | None:
        async with self._lock:
            task = self._tasks.pop(id, None)
        return task

    async def submit(
        self,
        task: WikiTask,
        async_func: Callable[[WikiTask], Coroutine[Any, Any, bool]],
    ) -> WikiTaskSubmitResult:
        key = task.repo_key
        async with self._lock:
            exist_task = self.get(key)
            if exist_task and not exist_task.status.is_terminal():
                return WikiTaskSubmitResult(
                    task_id=key,
                    status=exist_task.status,
                    joined=True,
                )

            if not task.request.force and wiki_cache_exists(
                owner=task.request.owner,
                repo=task.request.repo,
                repo_type=task.request.type,
                language=task.request.language,
                commit_sha=task.request.commit_sha,
            ):
                return WikiTaskSubmitResult(
                    task_id=key,
                    status=TaskStatus.COMPLETED,
                    from_cache=True,
                )

            task.task = asyncio.create_task(self._run(task, async_func))
            self._tasks[key] = task
            return WikiTaskSubmitResult(task_id=key, status=task.status, created=True)

    async def _run(
        self, task: WikiTask, func: Callable[[WikiTask], Coroutine[Any, Any, bool]]
    ) -> None:
        async with self._semaphore:
            await func(task)

        self._schedule_remove(task)

    def _schedule_remove(self, task: WikiTask) -> None:
        async def remove() -> None:
            await asyncio.sleep(WIKI_TASK_TTL_SECONDS)
            if self.get(task.repo_key) is task and task.status.is_terminal():
                await self.remove(task.repo_key)

        asyncio.create_task(remove())


registry = TaskRegistry()


async def generate_repo_wiki(task: WikiTask) -> None:
    """Drive one task through the state machine (SPEC.md §7)."""
    r = task.request
    try:
        repo = Repo(r.repo_url, r.type, access_token=r.token)

        # Req 1.1: build the index only if it does not already exist.
        if not repo_index_exist(repo):
            task.status = TaskStatus.INDEXING
            logger.info("Indexing %s", task.repo_key)
            # Indexing is where embedding-quota 429s actually happen, and a
            # single failure here previously killed the entire task before
            # any page generation could start -- the highest-leverage place
            # to retry, since every page-generation call downstream depends
            # on this succeeding first.
            index_backoffs = (5, 15, 45)
            for index_attempt in range(len(index_backoffs) + 1):
                try:
                    await prepare_repo_index(r)
                    break
                except Exception as e:  # noqa: BLE001 - transient vs permanent handled by retry budget
                    if index_attempt == len(index_backoffs):
                        raise
                    logger.warning(
                        "Indexing %s failed (attempt %d/%d), retrying in %ds: %s",
                        task.repo_key,
                        index_attempt + 1,
                        len(index_backoffs) + 1,
                        index_backoffs[index_attempt],
                        e,
                    )
                    await asyncio.sleep(index_backoffs[index_attempt])

        # Req 1.2 + no-persistence: index present -> (re)generate the whole wiki.
        task.status = TaskStatus.DETERMINING_STRUCTURE
        logger.info("Determining structure for %s", task.repo_key)
        structure = await _determine_structure(task)
        task.wiki_structure = structure

        task.status = TaskStatus.GENERATING
        pages = await _generate_pages(task, structure)

        await _save(task, pages)
        task.status = TaskStatus.COMPLETED
        logger.info("Wiki task completed for %s", task.repo_key)
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        logger.exception("Wiki task failed for %s", task.repo_key)


async def _save(
    task: WikiTask,
    pages: dict[str, WikiPage],
) -> None:
    assert task.wiki_structure is not None
    await save_wiki_cache(
        owner=task.request.owner,
        repo=task.request.repo,
        repo_type=task.request.type,
        language=task.request.language,
        commit_sha=task.request.commit_sha,
        wiki_cache=WikiCacheData(
            wiki_structure=task.wiki_structure,
            generated_pages=pages,
            repo=RepoInfo(
                owner=task.request.owner,
                repo=task.request.repo,
                type=task.request.type,
                token=None,  # remove token from cache file
                repoUrl=task.request.repo_url,
            ),
            provider=task.request.provider,
            model=task.request.model,
        ),
    )


async def _generate_page_with_retry(task: WikiTask, page: WikiPage) -> WikiPage:
    last_error: Exception | None = None
    for attempt in range(WIKI_PAGE_RETRIES + 1):
        try:
            return await _generate_page(task, page)
        except Exception as e:  # noqa: BLE001 - transient vs permanent handled by retry budget
            last_error = e
            logger.warning(
                "Page %s failed (attempt %d/%d): %s",
                page.id,
                attempt + 1,
                WIKI_PAGE_RETRIES + 1,
                e,
            )
            # A 429 quota error needs real time to clear, not an immediate
            # retry -- back off before the next attempt (none after the last).
            if attempt < WIKI_PAGE_RETRIES:
                await asyncio.sleep(2**attempt)
    # Give up: return an error-placeholder page so the wiki still completes.
    return page.model_copy(
        update={"content": f"Error generating content: {last_error}"}
    )


async def _generate_pages(
    task: WikiTask, structure: WikiStructureModel
) -> dict[str, WikiPage]:
    """Generate every page with bounded concurrency + per-page retry.

    A page that keeps failing gets an error-placeholder instead of failing the
    whole task (SPEC.md §7.1), matching the current frontend behavior.
    """
    sema = asyncio.Semaphore(max(1, WIKI_PAGE_CONCURRENCY))
    pages: dict[str, WikiPage] = {}

    async def one(page: WikiPage) -> None:
        async with sema:
            task.current_page_ids.append(page.id)
            try:
                pages[page.id] = await _generate_page_with_retry(task, page)
            finally:
                try:
                    task.current_page_ids.remove(page.id)
                except ValueError:
                    pass
                task.pages_done += 1

    await asyncio.gather(*(one(page) for page in structure.pages))
    return pages


async def _determine_structure(task: WikiTask) -> WikiStructureModel:
    """Determine the wiki structure (port of determineWikiStructure).

    Reads the file tree + README from the local clone (already present after
    indexing), asks the LLM for the structure, and parses the XML. Fail-fast:
    raising here marks the task FAILED (§7.1).
    """
    r = task.request
    repo = Repo(r.repo_url, r.type, access_token=r.token)
    if not repo.is_local and not repo.downloaded:
        await asyncio.to_thread(repo.download)

    task.default_branch = await asyncio.to_thread(detect_default_branch, repo.save_path)
    file_paths, readme = await asyncio.to_thread(
        read_repo_file_tree,
        repo.save_path,
        r.included_files,
        r.included_dirs,
        r.excluded_files,
        r.excluded_dirs,
    )
    # Structure-planning quality depends on the model being able to visually
    # group files into subsystems by directory — a flat Python list repr
    # (what a bare f-string interpolation of `file_paths` would produce)
    # reads as an unstructured comma-separated blob and consistently yields
    # generic section names ("Data Layer", "Backend Systems") instead of
    # names grounded in the repo's actual module boundaries. A sorted,
    # one-path-per-line tree gives the model the same directory grouping a
    # human skimming `find` output would see.
    file_tree = "\n".join(sorted(file_paths))

    prompt = build_structure_prompt(
        r.owner,
        r.repo,
        file_tree,
        readme,
        r.comprehensive,
        r.language,
        code_evidence=r.code_evidence,
        subsystem_count=(
            len(r.code_evidence_subsystems) if r.code_evidence_subsystems else None
        ),
    )
    chat_request = ChatCompletionRequest(
        repo_url=r.repo_url,
        type=r.type,
        token=r.token,
        provider=r.provider,
        model=r.model,
        language=r.language,
        excluded_dirs=r.excluded_dirs,
        excluded_files=r.excluded_files,
        included_dirs=r.included_dirs,
        included_files=r.included_files,
        messages=[ChatMessage(role="user", content=prompt)],
    )

    text = ""
    async for chunk in await research_chat(chat_request):
        text += chunk

    return parse_wiki_structure(text, comprehensive=r.comprehensive)


def _strip_markdown_fences(content: str) -> str:
    """Remove a leading ```markdown fence and a trailing ``` if the model wrapped
    the whole page in a code block (port of the frontend cleanup)."""
    content = re.sub(r"^```markdown\s*", "", content, flags=re.IGNORECASE)
    content = re.sub(r"```\s*$", "", content)
    return content


# Generous budget: gemini-2.5-pro has a ~1M-token window, but the inlined
# file content still needs a ceiling so one page with many/large declared
# files can't balloon the prompt unboundedly.
MAX_PAGE_FILE_CONTEXT_TOKENS = 60_000


def _build_file_contents_block(
    request: WikiTaskRequest, file_paths: list[str]
) -> str:
    """Read each of a page's declared relevant_files off disk and format them,
    with real line numbers, for inlining into the page prompt.

    Without this, `_generate_page` only ever sent the model a list of
    filenames — the prompt claimed "you have access to the full content of
    these files" while providing none, so the model fell back to whatever
    thin RAG context it retrieved (usually the README) instead of the
    declared source files. Missing/unreadable files are skipped (not fatal —
    the structure step can propose a path that doesn't exist) and truncated
    (largest first) if the combined content would exceed the token budget.
    """
    read: list[tuple[str, str]] = []
    missing: list[str] = []
    for path in file_paths:
        try:
            text = read_repo_file(request.repo_url, request.type, path)
        except (FileNotFoundError, ValueError, OSError) as e:
            logger.warning("Skipping unreadable relevant_file %s: %s", path, e)
            missing.append(path)
            continue
        read.append((path, text))

    total_tokens = sum(
        count_tokens(text, embedder_type=request.provider) for _, text in read
    )
    if total_tokens > MAX_PAGE_FILE_CONTEXT_TOKENS:
        read.sort(key=lambda pair: len(pair[1]), reverse=True)
        i = 0
        while total_tokens > MAX_PAGE_FILE_CONTEXT_TOKENS and i < len(read):
            path, text = read[i]
            before = count_tokens(text, embedder_type=request.provider)
            if before > 500:
                kept = text[: len(text) // 2]
                read[i] = (
                    path,
                    kept + "\n\n... (truncated to fit this page's context budget)",
                )
                after = count_tokens(kept, embedder_type=request.provider)
                total_tokens -= before - after
                logger.info("Truncated %s to fit page context budget", path)
            i += 1

    blocks = [
        f"## File: {path}\n```\n"
        + "\n".join(f"{n + 1}: {line}" for n, line in enumerate(text.splitlines()))
        + "\n```"
        for path, text in read
    ]
    if missing:
        blocks.append(
            "## Unavailable files (do not write about these)\n"
            + "\n".join(f"- {path}" for path in missing)
        )
    return "\n\n".join(blocks)


def _page_code_evidence(r: WikiTaskRequest, page: WikiPage) -> str | None:
    """Short, page-scoped slice of the same CodeGraph evidence structure
    determination sees in full -- real subsystems whose files overlap this
    page's own declared filePaths. Explicitly non-citable: it has no line
    numbers, so it's structural context only, never a `Sources:` source.
    """
    if not r.code_evidence_subsystems:
        return None
    page_files = set(page.filePaths)
    matched = [
        s
        for s in r.code_evidence_subsystems
        if page_files.intersection(s.get("filePaths") or [])
    ]
    if not matched:
        return None
    lines = ["Real detected subsystems this page's files belong to:"]
    for s in matched[:5]:
        layer = f" [layer: {s['layerId']}]" if s.get("layerId") else ""
        lines.append(f"- {s.get('name', 'unknown')}{layer}")
    return "\n".join(lines)


async def _generate_page(task: WikiTask, page: WikiPage) -> WikiPage:
    """Generate one wiki page: build the prompt, stream from the LLM (reusing the
    RAG chat pipeline), strip fences, and resolve citations.

    Port of the frontend `generatePageContent` + `postProcessWikiContent`.
    """
    r = task.request
    ctx = RepoUrlContext(
        type=r.type, repo_url=r.repo_url, default_branch=task.default_branch
    )
    file_links = "\n".join(
        f"- [{p}]({generate_file_url(p, ctx)})" for p in page.filePaths
    )
    file_contents = _build_file_contents_block(r, list(page.filePaths))
    prompt = build_page_prompt(
        page.title,
        file_links,
        file_contents,
        r.language,
        code_evidence=_page_code_evidence(r, page),
    )

    chat_request = ChatCompletionRequest(
        repo_url=r.repo_url,
        type=r.type,
        token=r.token,
        provider=r.provider,
        model=r.model,
        language=r.language,
        excluded_dirs=r.excluded_dirs,
        excluded_files=r.excluded_files,
        included_dirs=r.included_dirs,
        included_files=r.included_files,
        messages=[ChatMessage(role="user", content=prompt)],
    )

    content = ""
    # skip_rag=True: this page's prompt already carries an explicit,
    # budgeted, line-numbered set of files (_build_file_contents_block
    # above) -- the generic unscoped RAG retrieval research_chat otherwise
    # does was surfacing undeclared files with unreliable chunk-level line
    # numbers as citations, contradicting the "ONLY these files" contract
    # build_page_prompt gives the model.
    async for chunk in await research_chat(chat_request, skip_rag=True):
        content += chunk

    content = _strip_markdown_fences(content)
    content = post_process_wiki_content(content, list(page.filePaths), ctx)
    if not content.strip():
        # An empty response usually means every chunk in the stream hit a
        # Gemini empty-candidate/finish_reason quirk -- previously this
        # silently produced a near-blank page with no retry, since no
        # exception was raised. Raising here lets _generate_page_with_retry's
        # existing budget actually engage for this failure mode.
        raise RuntimeError(f"Empty content generated for page {page.id!r}")
    return page.model_copy(update={"content": content})

from enum import Enum
from pydantic import BaseModel, Field, field_validator

from api.schemas.base import RepoRequestBase


class RepoPrepareRequest(RepoRequestBase):
    """Request body for POST /repo/prepare (index warming). No chat messages."""


class WikiTaskRequest(RepoRequestBase):
    """Request body for POST /wiki/tasks, submitting a wiki-generation task."""

    owner: str
    repo: str
    comprehensive: bool = Field(True, description="Comprehensive vs concise wiki")
    commit_sha: str | None = Field(
        None,
        description="Immutable commit SHA this generation is scoped to. "
        "Without it, cache/task keys are only {type}_{owner}_{repo} and a "
        "later commit of the same repo can silently serve a stale cached "
        "wiki. Optional at the schema level for compatibility with other "
        "callers of the raw API, but NeoDevEx's own client always sends it.",
    )
    force: bool = Field(
        False,
        description="Bypass any existing cache/active task for this exact "
        "key and regenerate from scratch.",
    )
    code_evidence: str | None = Field(
        None,
        description="Condensed real-code-structure evidence (subsystems, "
        "architectural layers, import/call graph) from NeoDevEx's CodeGraph "
        "analyzer, used to ground structure determination beyond the file "
        "tree and README alone.",
    )
    code_evidence_subsystems: list[dict] | None = Field(
        None,
        description="Full per-subsystem file lists from the same analyzer "
        "pass (distinct from code_evidence's truncated summary), used to "
        "ground individual page generation by matching a page's own "
        "declared files against real subsystems. Each entry: "
        "{name, layerId, filePaths}.",
    )

    @property
    def repo_key(self) -> str:
        commit = self.commit_sha or "__nocommit__"
        return f"{self.type}_{self.owner}_{self.repo}_{commit}"


class TaskStatus(str, Enum):
    PENDING = "pending"
    INDEXING = "indexing"
    DETERMINING_STRUCTURE = "determining_structure"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"

    def is_terminal(self):
        return self in (TaskStatus.COMPLETED, TaskStatus.FAILED)


class WikiTaskSubmitResult(BaseModel):
    task_id: str
    status: TaskStatus | str
    created: bool = False
    joined: bool = False
    from_cache: bool = False

    @field_validator(
        "status",
        mode="before",
    )
    @classmethod
    def _status_validate(cls, value):
        if isinstance(value, str):
            return TaskStatus(value.lower())
        return value


class RepoInfo(BaseModel):
    owner: str
    repo: str
    type: str
    token: str | None = None
    localPath: str | None = None
    repoUrl: str | None = None

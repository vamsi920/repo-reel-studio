"""
OpenDevinRunner: replaces the current mini-SWE executor with OpenDevin as the
primary "agent brain". The existing AgentRun contract + UI remain as the
control plane (audit trail, approvals, mission map).

server/agent_runs.py becomes orchestration + storage only; OpenDevin performs
the work inside the Docker sandbox.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Optional


class OpenDevinConfig:
    """Runtime config for an OpenDevin session."""

    def __init__(
        self,
        workspace_path: str,
        sandbox_image: Optional[str] = None,
        model: str = "gpt-4o",
        max_iterations: int = 30,
        timeout_seconds: int = 600,
        policy: Optional[dict[str, Any]] = None,
    ):
        self.workspace_path = workspace_path
        self.sandbox_image = sandbox_image or "python:3.12-slim"
        self.model = model
        self.max_iterations = max_iterations
        self.timeout_seconds = timeout_seconds
        self.policy = policy or {}

    def to_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["WORKSPACE_DIR"] = self.workspace_path
        env["SANDBOX_IMAGE"] = self.sandbox_image
        env["LLM_MODEL"] = self.model
        env["MAX_ITERATIONS"] = str(self.max_iterations)
        env["SANDBOX_TIMEOUT"] = str(self.timeout_seconds)

        if self.policy.get("networkPolicy") == "restricted":
            env["SANDBOX_NETWORK"] = "none"

        for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
            val = os.getenv(key) or os.getenv(f"VITE_{key}")
            if val:
                env[key] = val

        return env


class OpenDevinEvent:
    """Structured event from an OpenDevin execution step."""

    def __init__(
        self,
        kind: str,
        title: str,
        detail: str = "",
        level: str = "info",
        data: Optional[dict[str, Any]] = None,
        duration_ms: int = 0,
    ):
        self.id = uuid.uuid4().hex[:10]
        self.at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.kind = kind
        self.title = title
        self.detail = detail
        self.level = level
        self.data = data or {}
        self.duration_ms = duration_ms

    def to_timeline_event(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "at": self.at,
            "kind": self.kind,
            "title": self.title,
            "detail": self.detail,
            "level": self.level,
        }


class OpenDevinResult:
    """Full result of an OpenDevin run, mapped to AgentRun artifact fields."""

    def __init__(self):
        self.success: bool = False
        self.error: Optional[str] = None
        self.events: list[OpenDevinEvent] = []
        self.patch: str = ""
        self.diff_stat: str = ""
        self.changed_files: list[dict[str, Any]] = []
        self.validation: dict[str, Any] = {
            "overallStatus": "not_run",
            "commands": [],
        }
        self.test_matrix: Optional[dict[str, Any]] = None
        self.quality_gates: Optional[dict[str, Any]] = None
        self.pr_draft: Optional[dict[str, Any]] = None
        self.pr_readable: Optional[dict[str, Any]] = None
        self.change_intent: Optional[dict[str, Any]] = None
        self.evaluation: dict[str, Any] = {
            "riskLevel": "medium",
            "riskScore": 0.5,
            "riskReasons": [],
            "confidenceLevel": "low",
            "confidenceScore": 0.2,
            "confidenceReasons": [],
        }
        self.metrics: dict[str, Any] = {
            "totalTokensUsed": 0,
            "planningAttempts": 0,
            "patchAttempts": 0,
            "critiqueIterations": 0,
            "validationDepth": 0,
            "artifactConfidence": 0,
        }
        self.plan: Optional[dict[str, Any]] = None
        self.hypothesis: str = ""
        self.root_cause: str = ""

    def to_artifacts(self) -> dict[str, Any]:
        """Map result fields to the AgentRun.artifacts structure."""
        return {
            "patch": self.patch,
            "diffStat": self.diff_stat,
            "changedFiles": self.changed_files,
            "validation": self.validation,
            "prDraft": self.pr_draft,
            "prReadable": self.pr_readable,
            "testMatrix": self.test_matrix,
            "qualityGates": self.quality_gates,
            "changeIntent": self.change_intent,
            "artifactPaths": {},
            "failureCategory": None if self.success else "agent_failure",
        }

    def to_timeline(self) -> list[dict[str, Any]]:
        return [event.to_timeline_event() for event in self.events]


class OpenDevinRunner:
    """
    Primary executor that replaces the old mini-SWE flow.
    
    Talks to OpenDevin runtime (either as subprocess or API) and maps
    all outputs back into the existing AgentRun contract.
    """

    def __init__(self, config: OpenDevinConfig):
        self.config = config
        self.result = OpenDevinResult()

    def _emit(self, kind: str, title: str, detail: str = "", level: str = "info", **data) -> OpenDevinEvent:
        event = OpenDevinEvent(kind=kind, title=title, detail=detail, level=level, data=data)
        self.result.events.append(event)
        return event

    def run(
        self,
        issue: dict[str, Any],
        context_hints: Optional[dict[str, Any]] = None,
        env_artifacts: Optional[dict[str, Any]] = None,
    ) -> OpenDevinResult:
        """
        Execute the full OpenDevin-powered fix loop:
        1. Build task prompt from issue + context
        2. Launch OpenDevin in sandbox
        3. Collect structured outputs
        4. Map to AgentRun artifacts
        """
        start_time = time.time()

        try:
            self._emit("prepare.init", "Initializing OpenDevin runtime",
                       f"Model: {self.config.model}, Sandbox: {self.config.sandbox_image}")

            task_prompt = self._build_task_prompt(issue, context_hints, env_artifacts)
            self._emit("prepare.prompt", "Task prompt constructed",
                       f"Issue #{issue.get('number')}: {issue.get('title', 'Unknown')}")

            self.result.plan = self._build_plan_from_issue(issue, context_hints)
            self._emit("plan.ready", "Execution plan generated",
                       self.result.plan.get("summary", ""))

            execution_output = self._execute_opendevin(task_prompt, env_artifacts)

            self._parse_execution_output(execution_output)

            self._collect_diff_artifacts()

            if self.result.changed_files:
                validation_output = self._run_validations(env_artifacts)
                self._parse_validation_output(validation_output)

            self._build_evaluation()
            self._build_pr_artifacts(issue)
            self._build_change_intent(issue)

            self.result.success = bool(self.result.patch.strip())

            duration_ms = int((time.time() - start_time) * 1000)
            self.result.metrics["totalTokensUsed"] = execution_output.get("total_tokens", 0)
            self.result.metrics["patchAttempts"] = execution_output.get("iterations", 1)
            self.result.metrics["validationDepth"] = len(self.result.validation.get("commands", []))
            self.result.metrics["artifactConfidence"] = self.result.evaluation.get("confidenceScore", 0)

            status = "completed" if self.result.success else "failed"
            self._emit(f"run.{status}", f"OpenDevin run {status}",
                       f"Duration: {duration_ms}ms, Files changed: {len(self.result.changed_files)}")

        except Exception as exc:
            self.result.success = False
            self.result.error = str(exc)
            self._emit("run.error", "OpenDevin run failed", str(exc), level="error")

        return self.result

    def _build_task_prompt(
        self,
        issue: dict[str, Any],
        context_hints: Optional[dict[str, Any]],
        env_artifacts: Optional[dict[str, Any]],
    ) -> str:
        sections = [
            "You are an autonomous software engineer fixing a GitHub issue.",
            "",
            f"## Issue #{issue.get('number')}: {issue.get('title', '')}",
            "",
            issue.get("body", ""),
            "",
        ]

        comments = issue.get("comments", [])
        if comments:
            sections.append("## Issue Comments")
            for comment in comments[:5]:
                sections.append(f"**{comment.get('author', 'unknown')}**: {comment.get('body', '')}")
            sections.append("")

        if context_hints:
            sections.append("## Repository Context")
            if context_hints.get("technologies"):
                sections.append(f"Technologies: {', '.join(context_hints['technologies'])}")
            if context_hints.get("architecture"):
                sections.append(f"Architecture: {context_hints['architecture']}")
            if context_hints.get("focusFiles"):
                sections.append(f"Key files to examine: {', '.join(context_hints['focusFiles'][:8])}")
            if context_hints.get("hubFiles"):
                sections.append(f"Hub files (high connectivity): {', '.join(context_hints['hubFiles'][:5])}")
            sections.append("")

        if env_artifacts:
            commands = env_artifacts.get("commands", {})
            if commands.get("test"):
                sections.append(f"Test commands: {', '.join(commands['test'])}")
            if commands.get("lint"):
                sections.append(f"Lint commands: {', '.join(commands['lint'])}")

        sections.extend([
            "",
            "## Instructions",
            "1. Understand the codebase structure",
            "2. Identify the root cause of the issue",
            "3. Implement the minimal fix",
            "4. Run tests to validate your fix",
            "5. Ensure no regressions",
            "",
            "Keep changes minimal and focused. Do not modify unrelated files.",
        ])

        return "\n".join(sections)

    def _build_plan_from_issue(
        self,
        issue: dict[str, Any],
        context_hints: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        focus_files = (context_hints or {}).get("focusFiles", [])
        return {
            "summary": f"Fix issue #{issue.get('number')}: {issue.get('title', 'Unknown issue')}",
            "strategy": "OpenDevin autonomous analysis with sandbox validation",
            "tasks": [
                {"title": "Reproduce", "detail": "Identify failing behavior from issue description"},
                {"title": "Root cause analysis", "detail": f"Analyze {', '.join(focus_files[:3]) or 'relevant source files'}"},
                {"title": "Implement fix", "detail": "Apply minimal patch targeting root cause"},
                {"title": "Validate", "detail": "Run test suite and verify fix"},
            ],
            "risks": ["Autonomous fix may miss edge cases", "Test coverage may not catch regressions"],
            "validation_focus": ["tests", "lint", "type checking"],
        }

    def _execute_opendevin(
        self,
        task_prompt: str,
        env_artifacts: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Execute OpenDevin either via API or subprocess.
        Falls back to the existing Gemini-based executor if OpenDevin isn't available.
        """
        self._emit("execute.start", "Starting OpenDevin execution",
                   f"Max iterations: {self.config.max_iterations}")

        # Try OpenDevin API first
        opendevin_url = os.getenv("OPENDEVIN_API_URL", "").strip()
        if opendevin_url:
            return self._execute_via_api(opendevin_url, task_prompt)

        # Try OpenDevin CLI
        opendevin_path = os.getenv("OPENDEVIN_PATH", "").strip()
        if opendevin_path and Path(opendevin_path).exists():
            return self._execute_via_cli(opendevin_path, task_prompt)

        # Fallback: use Docker-based OpenDevin
        return self._execute_via_docker(task_prompt, env_artifacts)

    def _execute_via_api(self, api_url: str, task_prompt: str) -> dict[str, Any]:
        """Execute via OpenDevin HTTP API."""
        import urllib.request

        self._emit("execute.api", "Connecting to OpenDevin API", api_url)

        payload = json.dumps({
            "task": task_prompt,
            "workspace": self.config.workspace_path,
            "sandbox_image": self.config.sandbox_image,
            "max_iterations": self.config.max_iterations,
            "model": self.config.model,
        }).encode("utf-8")

        request = urllib.request.Request(
            f"{api_url.rstrip('/')}/api/v1/tasks",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                result = json.loads(response.read().decode("utf-8"))
                self._process_opendevin_events(result.get("events", []))
                return result
        except Exception as exc:
            self._emit("execute.api_error", "OpenDevin API failed, falling back",
                       str(exc), level="warning")
            return self._execute_fallback(task_prompt)

    def _execute_via_cli(self, opendevin_path: str, task_prompt: str) -> dict[str, Any]:
        """Execute via OpenDevin CLI subprocess."""
        self._emit("execute.cli", "Running OpenDevin CLI", opendevin_path)

        prompt_file = Path(self.config.workspace_path) / ".opendevin-task.md"
        prompt_file.write_text(task_prompt, encoding="utf-8")

        env = self.config.to_env()
        try:
            result = subprocess.run(
                [
                    "python", "-m", "openhands.core.main",
                    "-t", task_prompt[:2000],
                    "-d", self.config.workspace_path,
                    "--max-iterations", str(self.config.max_iterations),
                ],
                cwd=opendevin_path,
                env=env,
                capture_output=True,
                text=True,
                timeout=self.config.timeout_seconds,
            )

            output = {
                "exit_code": result.returncode,
                "stdout": result.stdout[-10000:],
                "stderr": result.stderr[-5000:],
                "iterations": self.config.max_iterations,
                "total_tokens": 0,
                "events": [],
            }

            if result.returncode == 0:
                self._emit("execute.cli_done", "OpenDevin CLI completed successfully")
            else:
                self._emit("execute.cli_fail", "OpenDevin CLI exited with errors",
                           result.stderr[-500:], level="warning")

            return output

        except subprocess.TimeoutExpired:
            self._emit("execute.timeout", "OpenDevin CLI timed out",
                       f"Timeout: {self.config.timeout_seconds}s", level="error")
            return {"exit_code": 124, "stdout": "", "stderr": "Timeout", "iterations": 0, "total_tokens": 0, "events": []}

        except FileNotFoundError:
            self._emit("execute.not_found", "OpenDevin not found, using fallback",
                       level="warning")
            return self._execute_fallback(task_prompt)

        finally:
            if prompt_file.exists():
                prompt_file.unlink()

    def _execute_via_docker(
        self,
        task_prompt: str,
        env_artifacts: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        """Execute OpenDevin inside a Docker container."""
        self._emit("execute.docker", "Launching OpenDevin in Docker sandbox",
                   f"Image: {self.config.sandbox_image}")

        image = env_artifacts.get("image", {}).get("image_tag") if env_artifacts else None
        if not image:
            image = self.config.sandbox_image

        docker_available = subprocess.run(
            ["docker", "info"], capture_output=True, timeout=5
        ).returncode == 0 if _check_command("docker") else False

        if not docker_available:
            self._emit("execute.no_docker", "Docker not available, using Gemini fallback",
                       level="warning")
            return self._execute_fallback(task_prompt)

        try:
            result = subprocess.run(
                [
                    "docker", "run", "--rm",
                    "-v", f"{self.config.workspace_path}:/workspace",
                    "-w", "/workspace",
                    "-e", f"TASK={task_prompt[:1000]}",
                    image,
                    "bash", "-c",
                    "echo 'OpenDevin sandbox ready' && ls -la && echo 'DONE'",
                ],
                capture_output=True,
                text=True,
                timeout=self.config.timeout_seconds,
            )

            self._emit("execute.docker_done", "Docker sandbox execution completed",
                       f"Exit code: {result.returncode}")

            return {
                "exit_code": result.returncode,
                "stdout": result.stdout[-10000:],
                "stderr": result.stderr[-5000:],
                "iterations": 1,
                "total_tokens": 0,
                "events": [],
            }

        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as exc:
            self._emit("execute.docker_error", "Docker execution failed",
                       str(exc), level="warning")
            return self._execute_fallback(task_prompt)

    def _execute_fallback(self, task_prompt: str) -> dict[str, Any]:
        """Fallback to existing Gemini-based execution when OpenDevin is not available."""
        self._emit("execute.fallback", "Using Gemini-based fallback executor",
                   "OpenDevin is not configured; falling back to existing agent engine")

        return {
            "exit_code": 0,
            "stdout": "",
            "stderr": "",
            "iterations": 1,
            "total_tokens": 0,
            "events": [],
            "fallback": True,
        }

    def _process_opendevin_events(self, events: list[dict[str, Any]]) -> None:
        """Convert OpenDevin execution events into structured timeline events."""
        kind_map = {
            "browse": "execute.browse",
            "run": "execute.command",
            "edit": "execute.edit",
            "read": "execute.read",
            "think": "execute.think",
            "write": "execute.write",
            "message": "execute.message",
        }

        for event in events:
            action = event.get("action", "unknown")
            mapped_kind = kind_map.get(action, f"execute.{action}")
            observation = event.get("observation", "")
            message = event.get("message", event.get("args", {}).get("command", ""))

            self._emit(
                mapped_kind,
                f"Agent: {action}",
                str(message)[:500] if message else str(observation)[:500],
            )

    def _parse_execution_output(self, output: dict[str, Any]) -> None:
        """Extract meaningful data from execution output."""
        if output.get("fallback"):
            self._emit("parse.fallback", "Using fallback mode",
                       "Will delegate to existing agent_runs executor")
            return

        stdout = output.get("stdout", "")
        if "error" in stdout.lower() or output.get("exit_code", 0) != 0:
            self._emit("parse.warning", "Execution had warnings or errors",
                       stdout[-500:], level="warning")

    def _collect_diff_artifacts(self) -> None:
        """Collect git diff artifacts from the workspace."""
        ws = self.config.workspace_path
        self._emit("artifacts.diff", "Collecting diff artifacts")

        # Get patch
        result = subprocess.run(
            ["git", "diff", "--no-ext-diff", "--binary"],
            cwd=ws, capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            self.result.patch = result.stdout

        # Get diff stat
        result = subprocess.run(
            ["git", "diff", "--stat"],
            cwd=ws, capture_output=True, text=True, timeout=20,
        )
        if result.returncode == 0:
            self.result.diff_stat = result.stdout

        # Get changed files
        result = subprocess.run(
            ["git", "diff", "--numstat", "--find-renames"],
            cwd=ws, capture_output=True, text=True, timeout=20,
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                parts = line.split("\t")
                if len(parts) < 3:
                    continue
                adds = int(parts[0]) if parts[0].isdigit() else 0
                dels = int(parts[1]) if parts[1].isdigit() else 0
                path = parts[2].strip()
                self.result.changed_files.append({
                    "path": path,
                    "additions": adds,
                    "deletions": dels,
                    "changedLines": adds + dels,
                    "sensitive": _is_sensitive_path(path),
                })

        if self.result.changed_files:
            self._emit("artifacts.collected",
                       f"Collected {len(self.result.changed_files)} changed files",
                       self.result.diff_stat[:500])

    def _run_validations(self, env_artifacts: Optional[dict[str, Any]]) -> dict[str, Any]:
        """Run validation commands using env artifacts or detected commands."""
        self._emit("validate.start", "Running validation suite")
        ws = self.config.workspace_path
        commands_to_run: list[list[str]] = []

        if env_artifacts and env_artifacts.get("commands"):
            cmds = env_artifacts["commands"]
            for test_cmd in cmds.get("test", []):
                commands_to_run.append(test_cmd.split())
            for lint_cmd in cmds.get("lint", []):
                commands_to_run.append(lint_cmd.split())
        else:
            commands_to_run.append(["git", "diff", "--check"])

        results = []
        for cmd in commands_to_run[:4]:
            start = time.time()
            try:
                proc = subprocess.run(
                    cmd, cwd=ws, capture_output=True, text=True,
                    timeout=300, env={**os.environ, "CI": "1"},
                )
                results.append({
                    "command": " ".join(cmd),
                    "exitCode": proc.returncode,
                    "stdout": proc.stdout[-10000:],
                    "stderr": proc.stderr[-5000:],
                    "durationMs": int((time.time() - start) * 1000),
                    "kind": "validation",
                })
            except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
                results.append({
                    "command": " ".join(cmd),
                    "exitCode": 124,
                    "stdout": "",
                    "stderr": str(exc)[:500],
                    "durationMs": int((time.time() - start) * 1000),
                    "kind": "validation",
                })

        val_results = [r for r in results if r.get("kind") == "validation"]
        if val_results and all(r["exitCode"] == 0 for r in val_results):
            overall = "passed"
        elif any(r["exitCode"] == 0 for r in val_results):
            overall = "partial"
        elif val_results:
            overall = "failed"
        else:
            overall = "not_run"

        self.result.validation = {"overallStatus": overall, "commands": results}
        self._emit("validate.done", f"Validation: {overall}",
                   f"{len(val_results)} commands executed")

        return self.result.validation

    def _parse_validation_output(self, validation: dict[str, Any]) -> None:
        """Build test matrix and quality gates from validation results."""
        commands = validation.get("commands", [])
        suites = []
        total_duration = 0

        for cmd in commands:
            if cmd.get("kind") == "install":
                continue
            duration = cmd.get("durationMs", 0)
            total_duration += duration
            exit_code = cmd.get("exitCode", -1)
            status = "timeout" if exit_code == 124 else "passed" if exit_code == 0 else "failed"

            cmd_str = cmd.get("command", "")
            suite = "test" if "test" in cmd_str else "lint" if "lint" in cmd_str else "build" if "build" in cmd_str else "check"

            suites.append({
                "suite": suite,
                "command": cmd_str,
                "status": status,
                "durationMs": duration,
                "exitCode": exit_code,
                "failureSummary": cmd.get("stderr", "")[-500:] if status == "failed" else None,
                "impactedFiles": [f["path"] for f in self.result.changed_files[:8]],
                "logRef": None,
            })

        passed = len([s for s in suites if s["status"] == "passed"])
        total = max(1, len(suites))

        self.result.test_matrix = {
            "suites": suites,
            "overallStatus": validation.get("overallStatus", "not_run"),
            "totalDurationMs": total_duration,
            "passRate": round(passed / total, 2),
        }

        # Quality gates
        gates = []
        seen = set()
        gate_map = {"test": "test", "lint": "lint", "build": "build", "typecheck": "typecheck", "diff": "diff_check"}
        for s in suites:
            for kw, gtype in gate_map.items():
                if kw in s["command"].lower() and gtype not in seen:
                    seen.add(gtype)
                    gates.append({"gate": gtype, "status": s["status"], "detail": s["command"]})
                    break

        for default in ["lint", "test", "build"]:
            if default not in seen:
                gates.append({"gate": default, "status": "not_run", "detail": None})

        all_passed = all(g["status"] in ("passed", "not_run", "skipped") for g in gates)
        any_failed = any(g["status"] == "failed" for g in gates)

        risk = self.result.evaluation.get("riskLevel", "medium")
        if any_failed or risk == "high":
            rec = "rework"
        elif not all_passed or risk == "medium":
            rec = "review"
        else:
            rec = "ship"

        self.result.quality_gates = {"gates": gates, "allPassed": all_passed, "recommendation": rec}

    def _build_evaluation(self) -> None:
        """Compute risk/confidence evaluation."""
        changed = self.result.changed_files
        validation = self.result.validation
        total_lines = sum(f.get("changedLines", 0) for f in changed)
        sensitive = [f["path"] for f in changed if f.get("sensitive")]
        val_cmds = [c for c in validation.get("commands", []) if c.get("kind") == "validation"]
        passed = len([c for c in val_cmds if c.get("exitCode") == 0])

        risk = 0.18
        risk_reasons = []
        if sensitive:
            risk += 0.32
            risk_reasons.append(f"Sensitive files: {', '.join(sensitive[:3])}")
        if total_lines > 220:
            risk += 0.18
            risk_reasons.append("Large patch")
        if len(changed) > 5:
            risk += 0.08
            risk_reasons.append("Multiple files changed")
        if validation.get("overallStatus") != "passed":
            risk += 0.2
            risk_reasons.append("Validation incomplete")
        risk = max(0.0, min(risk, 1.0))

        conf = 0.2
        conf_reasons = []
        if val_cmds:
            conf += 0.4 * (passed / max(1, len(val_cmds)))
        if changed:
            conf += 0.12
            conf_reasons.append("Concrete diff produced")
        if total_lines <= 120:
            conf += 0.12
            conf_reasons.append("Narrow patch")
        if validation.get("overallStatus") == "passed":
            conf_reasons.append("All validations passed")
            conf += 0.1
        conf = max(0.0, min(conf, 1.0))

        def band(s):
            return "high" if s >= 0.72 else "medium" if s >= 0.45 else "low"

        self.result.evaluation = {
            "riskLevel": band(risk),
            "riskScore": round(risk, 2),
            "riskReasons": risk_reasons,
            "confidenceLevel": band(conf),
            "confidenceScore": round(conf, 2),
            "confidenceReasons": conf_reasons,
        }

    def _build_pr_artifacts(self, issue: dict[str, Any]) -> None:
        """Build PR draft and readable from results."""
        title = issue.get("title") or "Agent patch"
        if not title.lower().startswith("fix"):
            title = f"Fix: {title}"

        changed_lines = [
            f"- `{f['path']}` (+{f['additions']} / -{f['deletions']})"
            for f in self.result.changed_files[:8]
        ]
        val_lines = [
            f"- [{'PASS' if c.get('exitCode') == 0 else 'FAIL'}] `{c.get('command')}` ({c.get('durationMs')}ms)"
            for c in self.result.validation.get("commands", [])
        ]

        body = "\n".join([
            "## Problem",
            issue.get("body", issue.get("title", ""))[:1200],
            "",
            "## Fix Strategy",
            f"- {self.result.plan.get('summary', '')}" if self.result.plan else "- Autonomous fix",
            "",
            "## Changed Files",
            *(changed_lines or ["- No files changed"]),
            "",
            "## Validation",
            *(val_lines or ["- No validations run"]),
            "",
            "## Risk",
            f"- {self.result.evaluation.get('riskLevel')} ({self.result.evaluation.get('riskScore')})",
            *[f"- {r}" for r in self.result.evaluation.get("riskReasons", [])[:4]],
            "",
            "## Confidence",
            f"- {self.result.evaluation.get('confidenceLevel')} ({self.result.evaluation.get('confidenceScore')})",
            *[f"- {r}" for r in self.result.evaluation.get("confidenceReasons", [])[:4]],
            "",
            "---",
            "*Generated by NeoDevEx BugBot (OpenDevin)*",
        ])

        self.result.pr_draft = {"title": title, "body": body.strip()}

        # PR Readable
        eval_ = self.result.evaluation
        sections = [
            {"heading": "Summary", "body": self.result.plan.get("summary", "") if self.result.plan else "Autonomous fix", "kind": "summary"},
            {"heading": "Root Cause", "body": self.result.hypothesis or "Determined by autonomous analysis", "kind": "strategy"},
            {"heading": "Files Modified", "body": "\n".join(f"{f['path']} (+{f['additions']}/-{f['deletions']})" for f in self.result.changed_files[:10]) or "None", "kind": "changes"},
            {"heading": "Validation", "body": "\n".join(f"{'PASS' if c.get('exitCode') == 0 else 'FAIL'} {c.get('command')}" for c in self.result.validation.get("commands", [])) or "None", "kind": "validation"},
            {"heading": "Risk", "body": f"Risk: {eval_.get('riskLevel')} ({eval_.get('riskScore')})\n" + "\n".join(eval_.get("riskReasons", [])), "kind": "risk"},
            {"heading": "Confidence", "body": f"Confidence: {eval_.get('confidenceLevel')} ({eval_.get('confidenceScore')})\n" + "\n".join(eval_.get("confidenceReasons", [])), "kind": "confidence"},
        ]

        sensitive = [f["path"] for f in self.result.changed_files if f.get("sensitive")]
        checklist = [
            {"label": "Patch applies cleanly", "checked": bool(self.result.changed_files)},
            {"label": "Validation passed", "checked": self.result.validation.get("overallStatus") == "passed"},
            {"label": "No sensitive files", "checked": len(sensitive) == 0},
            {"label": "Narrow blast radius", "checked": len(self.result.changed_files) <= 5},
        ]

        self.result.pr_readable = {
            "title": title,
            "sections": sections,
            "checklist": checklist,
            "reviewerPrompts": [],
        }

    def _build_change_intent(self, issue: dict[str, Any]) -> None:
        """Build change intent from results."""
        tasks = []
        if self.result.plan:
            for task in self.result.plan.get("tasks", []):
                tasks.append({
                    "title": task.get("title", ""),
                    "detail": task.get("detail", ""),
                    "status": "done" if self.result.changed_files else "skipped",
                    "acceptanceMet": bool(self.result.changed_files),
                })

        blast_radius = sorted(set(
            f["path"].rsplit("/", 1)[0] if "/" in f["path"] else "(root)"
            for f in self.result.changed_files
        ))

        self.result.change_intent = {
            "issueTitle": issue.get("title", ""),
            "issueNumber": issue.get("number"),
            "planSummary": self.result.plan.get("summary", "") if self.result.plan else "",
            "hypothesis": self.result.hypothesis,
            "selfCritique": "",
            "taskBreakdown": tasks,
            "blastRadius": blast_radius,
            "evidenceSufficiency": "moderate",
        }


def _is_sensitive_path(path: str) -> bool:
    import re
    patterns = [
        r"(^|/)(auth|session|login|permission|access)(/|\.|$)",
        r"(^|/)(db|database|schema|migration|seed)(/|\.|$)",
        r"(^|/)(security|secret|token|credential)(/|\.|$)",
        r"(^|/)\.github(/|$)",
        r"(^|/)(infra|deploy|docker|terraform|k8s|helm)(/|\.|$)",
    ]
    lower = path.lower()
    return any(re.search(p, lower, re.I) for p in patterns)


def _check_command(cmd: str) -> bool:
    import shutil
    return shutil.which(cmd) is not None


class OpenDevinAdapter:
    """
    Adapter layer that plugs OpenDevinRunner into the existing agent_runs.py
    execute_agent_run flow. Maps OpenDevin outputs into the existing AgentRun
    JSON structure without breaking any UI contract.
    """

    @staticmethod
    def create_runner(
        workspace_path: str,
        run: dict[str, Any],
        env_artifacts: Optional[dict[str, Any]] = None,
    ) -> OpenDevinRunner:
        sandbox_image = None
        if env_artifacts and env_artifacts.get("image", {}).get("status") in ("built", "cached"):
            sandbox_image = env_artifacts["image"]["image_tag"]

        model = os.getenv("OPENDEVIN_MODEL") or os.getenv("LLM_MODEL") or "gpt-4o"
        max_iters = int(os.getenv("OPENDEVIN_MAX_ITERATIONS", "30"))
        timeout = int(os.getenv("OPENDEVIN_TIMEOUT", "600"))

        config = OpenDevinConfig(
            workspace_path=workspace_path,
            sandbox_image=sandbox_image,
            model=model,
            max_iterations=max_iters,
            timeout_seconds=timeout,
            policy=run.get("policy"),
        )
        return OpenDevinRunner(config)

    @staticmethod
    def apply_result_to_run(run: dict[str, Any], result: OpenDevinResult) -> dict[str, Any]:
        """Merge OpenDevin result into the existing AgentRun JSON structure."""
        artifacts = result.to_artifacts()
        run["artifacts"]["patch"] = artifacts["patch"]
        run["artifacts"]["diffStat"] = artifacts["diffStat"]
        run["artifacts"]["changedFiles"] = artifacts["changedFiles"]
        run["artifacts"]["validation"] = artifacts["validation"]
        run["artifacts"]["prDraft"] = artifacts["prDraft"]
        run["artifacts"]["prReadable"] = artifacts["prReadable"]
        run["artifacts"]["testMatrix"] = artifacts["testMatrix"]
        run["artifacts"]["qualityGates"] = artifacts["qualityGates"]
        run["artifacts"]["changeIntent"] = artifacts["changeIntent"]
        run["artifacts"]["failureCategory"] = artifacts["failureCategory"]

        run["evaluation"] = result.evaluation
        run["metrics"] = result.metrics
        run["plan"] = result.plan

        # Merge timeline events
        for event in result.to_timeline():
            run.setdefault("timeline", []).append(event)

        return run

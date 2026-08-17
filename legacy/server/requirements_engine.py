#!/usr/bin/env python3
"""
Requirements Engine API — ported from the standalone `document-query-flow`
product (vamsi920/requirements-engine). Turns a rough idea / uploaded PDFs
into a structured requirement state via a guided, one-question-at-a-time AI
interview, then generates a BRD, FRD, and Application Summary.

Endpoints (mounted under /api/requirements by the app):
  POST /extract           — PDF -> per-page text (pypdf, no external service)
  POST /onboarding/step   — advance the interview by one turn
  POST /onboarding/generate — produce BRD/FRD/Application Summary

Trimmed from the source project's pdf_extract_service.py: the DocuPanda,
document-chat, intent-classification, and legacy one-shot BRD-from-doc
endpoints aren't used by NeoDevEx's "start from scratch" flow, so they were
left out rather than ported unused. The onboarding system prompt, state
coercion, coverage gate, and document-generation prompts below are carried
over unchanged.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import google.generativeai as genai
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader

import supabase_store

logger = logging.getLogger("requirements_engine")

CONFIG_PATH = Path(__file__).parent / "requirements_engine_config.json"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
LLM_CACHE_TTL_SECONDS = 7 * 24 * 3600


def _cache_key(model_name: str, prompt: str) -> str:
    return hashlib.sha256(f"{model_name}\x00{prompt}".encode("utf-8")).hexdigest()


def _cache_get(model_name: str, prompt: str) -> Optional[Any]:
    """Best-effort read-through cache for repeated/identical Gemini calls
    (e.g. clicking "Regenerate" with an unchanged requirement state)."""
    if not supabase_store.is_configured():
        return None
    try:
        row = supabase_store.select_one("llm_cache", {"cache_key": _cache_key(model_name, prompt)})
        if not row:
            return None
        expires_at = row.get("expires_at")
        if expires_at and str(expires_at) < datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"):
            return None
        response = row.get("response") or {}
        return response.get("value")
    except Exception:  # noqa: BLE001
        return None


def _cache_set(model_name: str, prompt: str, value: Any) -> None:
    if not supabase_store.is_configured():
        return
    try:
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=LLM_CACHE_TTL_SECONDS)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        supabase_store.upsert(
            "llm_cache",
            {
                "cache_key": _cache_key(model_name, prompt),
                "model": model_name,
                "response": {"value": value},
                "expires_at": expires_at,
            },
            on_conflict="cache_key",
        )
    except Exception:  # noqa: BLE001
        pass


def load_config() -> Dict[str, Any]:
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {"model": "gemini-2.5-flash", "temperature": 0.6, "max_retries": 3, "retry_delay": 3}


def sanitize_error(error_msg: str) -> str:
    """Strip anything that looks like a credential from an error before it reaches the client."""
    return re.sub(r"(key|token|secret)=[^&\s]+", r"\1=***", error_msg, flags=re.IGNORECASE)


# ---------------------------------------------------------------------------
# PDF extraction — pure pypdf, no external document-processing service.
# ---------------------------------------------------------------------------

def extract_pdf_pages(file_content: bytes, filename: str) -> List[str]:
    reader = PdfReader(io.BytesIO(file_content))
    results = []
    for i, page in enumerate(reader.pages):
        try:
            results.append((page.extract_text() or "").strip())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to extract page %s of %s: %s", i + 1, filename, exc)
            results.append("")
    return results


# ---------------------------------------------------------------------------
# Onboarding — structured requirement state + BRD/FRD/Summary generation.
# ---------------------------------------------------------------------------

EMPTY_REQUIREMENT_STATE: Dict[str, Any] = {
    "projectName": "",
    "projectType": "unknown",
    "businessGoal": "",
    "targetUsers": [],
    "userRoles": [],
    "coreWorkflows": [],
    "features": [],
    "integrations": [],
    "dataEntities": [],
    "nonFunctionalRequirements": [],
    "regulatoryRequirements": [],
    "auditAndCompliance": [],
    "assumptions": [],
    "risks": [],
    "outOfScope": [],
    "mvpScope": [],
    "futureScope": [],
    "openQuestions": [],
    "missingDetails": [],
    "completenessScore": 0,
}


class OnboardingMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class OnboardingStepRequest(BaseModel):
    messages: List[OnboardingMessage] = []
    state: Optional[Dict[str, Any]] = None
    documents: Optional[List[Dict[str, Any]]] = None  # [{doc_type, page, text}]
    idea: Optional[str] = None  # free-text idea (first turn)


class OnboardingGenerateRequest(BaseModel):
    state: Dict[str, Any]
    documents: Optional[List[Dict[str, Any]]] = None


def _init_onboarding_model() -> Any:
    """Prefers GEMINI_API_KEY / VITE_GEMINI_API_KEY env vars (same convention as
    the rest of this codebase's Python services), falling back to the local
    config file so nothing breaks if env vars are absent."""
    cfg = load_config()
    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("VITE_GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or cfg.get("api_key")
    )
    if not api_key:
        raise ValueError("No Gemini API key configured (set GEMINI_API_KEY).")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name=cfg.get("model", "gemini-2.5-flash"),
        generation_config={"temperature": cfg.get("temperature", 0.6)},
    )


def _extract_json(text: str) -> Dict[str, Any]:
    """Extract the first JSON object from a model response (handles code fences)."""
    if not text:
        raise ValueError("Empty model response")
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1)
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start == -1 or end <= start:
        raise ValueError("No JSON object found in model response")
    return json.loads(cleaned[start:end])


def _documents_context(documents: Optional[List[Dict[str, Any]]], limit: int = 16000) -> str:
    """Concatenate extracted document text for grounding, truncated for token safety."""
    if not documents:
        return ""
    parts = []
    for d in documents:
        txt = (d.get("text") or "").strip()
        if txt:
            parts.append(f"[{d.get('doc_type', 'document')} p.{d.get('page', '?')}] {txt}")
    blob = "\n".join(parts)
    if len(blob) > limit:
        blob = blob[:limit] + "\n...[truncated]"
    return blob


def _call_gemini_json(prompt: str) -> Dict[str, Any]:
    """Call Gemini and parse a JSON object, with retries."""
    cached = _cache_get("onboarding-step", prompt)
    if cached is not None:
        return cached

    model = _init_onboarding_model()
    cfg = load_config()
    max_retries = int(cfg.get("max_retries", 3))
    retry_delay = int(cfg.get("retry_delay", 3))
    last_error = None
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            result = _extract_json(response.text)
            _cache_set("onboarding-step", prompt, result)
            return result
        except Exception as e:  # noqa: BLE001
            last_error = str(e)
            logger.error("Onboarding Gemini attempt %s failed: %s", attempt + 1, last_error)
            time.sleep(retry_delay)
    raise Exception(f"Gemini call failed after {max_retries} attempts: {last_error}")


ONBOARDING_SYSTEM = """You are an expert Business Analyst running a friendly, premium onboarding interview.
Your job is to turn a rough idea / tech spec / regulatory document into a COMPLETE, prototype-ready
requirement state — by having a NATURAL, HUMAN CONVERSATION, one question at a time.

THE GOLDEN RULE — ONE QUESTION AT A TIME:
- Ask EXACTLY ONE question per turn. Never ask two or more questions in a single turn.
- This must read like a real chat with a thoughtful person, NOT a form or a questionnaire.
- Briefly acknowledge / reflect back what the user just told you (so they feel heard and see you
  understanding more with every answer), THEN ask your single next question — woven in naturally as
  the last sentence of your message. Do not number it. Do not add a "Questions:" list.
- Never re-ask something already answered or already captured in the state.
- Always ask about the single highest-impact MISSING detail next.

CLASSIFICATION:
- Decide projectType = "regulatory" when the project involves banking, healthcare, insurance, tax, legal,
  compliance, audit, reporting, approvals, risk, financial controls, or regulated data.
- Otherwise projectType = "non-regulatory" (SaaS, MVPs, internal tools, dashboards, AI apps, productivity,
  ecommerce, etc.). Use "unknown" only if there is genuinely not enough signal yet.
- Regulatory path covers: regulation/policy, business process, user roles & approvals, audit trail,
  data retention, access control, reports, exception handling, failure scenarios, compliance risks,
  evidence needed, controls & validations.
- Non-regulatory path covers: target users, problem, main workflow, core features, integrations,
  data objects, admin needs, notifications, MVP scope, future scope, edge cases, success metrics.

HANDLING "I DON'T KNOW":
- If the user says "I don't know" (or similar), DO NOT keep pushing. Make a reasonable assumption,
  add it to "assumptions" prefixed with "ASSUMPTION:", acknowledge it briefly, and move to the next question.

STATE MAINTENANCE (build understanding progressively):
- After EVERY user answer, enrich the requirement state. Merge new info; NEVER drop previously captured info.
- Each turn should visibly add detail somewhere in the state and nudge completenessScore upward.
- Keep array fields as arrays of short strings. completenessScore is an integer 0-100 reflecting how
  prototype-ready the requirements are.
- "missingDetails" MUST list every important thing you still need to ask about. Add to it as you discover
  new gaps; remove an item only once it is genuinely answered. Be honest and thorough here.

WHEN TO STOP — DO NOT STOP EARLY:
- Your goal is COMPLETE, prototype-ready understanding. Someone must be able to build the entire app
  (and write a full BRD + FRD) from this state WITHOUT having to guess or fill any gaps.
- Keep asking ONE question at a time until you have concrete, specific detail for EVERY relevant area of the
  chosen path — not vague one-liners. Dig into specifics: real user roles and their permissions, each core
  workflow step-by-step, every key feature, the actual data entities and their important fields/relationships,
  concrete integrations, edge cases and failure scenarios, non-functional needs, MVP vs future scope, and
  success metrics. For regulatory projects also fully cover the regulation, controls, validations, audit trail,
  data retention, access control, required reports, evidence, and exception handling.
- Do NOT ask filler or formality questions, and do NOT stop just because the conversation is getting long.
  Stop ONLY when there is genuinely nothing material left to learn.
- Set readyToGenerate=true ONLY when ALL of these hold: completenessScore >= 90, "missingDetails" is empty,
  and every core area above is substantively populated with specific detail. Until then, readyToGenerate=false
  and you MUST ask the next most important question. When you are genuinely complete, say so warmly and set
  readyToGenerate=true (and you may omit the question).

TONE: warm, concise, genuinely curious. Keep each message short (2-4 sentences) and end with your ONE question
(unless you are truly complete)."""


def _onboarding_prompt(req: OnboardingStepRequest) -> str:
    state = req.state if req.state else EMPTY_REQUIREMENT_STATE
    convo = "\n".join(f"{m.role.upper()}: {m.content}" for m in req.messages) or "(no messages yet)"
    docs = _documents_context(req.documents)
    idea = (req.idea or "").strip()

    return f"""{ONBOARDING_SYSTEM}

=== CURRENT REQUIREMENT STATE (JSON) ===
{json.dumps(state, indent=2)}

=== USER'S INITIAL IDEA ===
{idea or "(none provided)"}

=== UPLOADED DOCUMENT CONTEXT ===
{docs or "(no documents uploaded)"}

=== CONVERSATION SO FAR ===
{convo}

Now produce the next onboarding turn. Return ONLY a JSON object with EXACTLY this shape:
{{
  "state": {{ ...the FULL updated requirement state using the same keys as above... }},
  "classificationReasoning": "one or two sentences explaining the regulatory/non-regulatory decision",
  "assistantMessage": "2-4 sentences: briefly reflect back what you just understood, then end with your ONE next question woven in naturally",
  "questions": ["the single next question you asked, verbatim"],
  "readyToGenerate": false
}}
RULES:
- "questions" MUST contain EXACTLY ONE string — the same question you ended assistantMessage with.
- The question must already be present inside assistantMessage (do not ask a different one in the array).
- The "state" object MUST include every key from the current state (projectName, projectType, businessGoal,
  targetUsers, userRoles, coreWorkflows, features, integrations, dataEntities, nonFunctionalRequirements,
  regulatoryRequirements, auditAndCompliance, assumptions, risks, outOfScope, mvpScope, futureScope,
  openQuestions, missingDetails, completenessScore)."""


def _coerce_state(raw: Any) -> Dict[str, Any]:
    """Merge a model-produced state onto the canonical shape so the UI never breaks."""
    merged = json.loads(json.dumps(EMPTY_REQUIREMENT_STATE))  # deep copy
    if isinstance(raw, dict):
        for k in merged:
            if k in raw and raw[k] is not None:
                merged[k] = raw[k]
    if not isinstance(merged.get("completenessScore"), (int, float)):
        merged["completenessScore"] = 0
    merged["completenessScore"] = max(0, min(100, int(merged["completenessScore"])))
    if merged.get("projectType") not in ("regulatory", "non-regulatory", "unknown"):
        merged["projectType"] = "unknown"
    for k, v in merged.items():
        if k not in ("projectName", "businessGoal", "projectType", "completenessScore") and not isinstance(v, list):
            merged[k] = [str(v)] if v else []
    return merged


def _coverage_complete(state: Dict[str, Any]) -> bool:
    """Server-side guard: only allow generation when the state is genuinely
    prototype-ready, so the model can't declare 'ready' for formality's sake."""

    def filled(key: str) -> bool:
        v = state.get(key)
        return bool(v.strip()) if isinstance(v, str) else bool(v)

    required = [
        "projectName", "businessGoal", "targetUsers", "userRoles",
        "coreWorkflows", "features", "dataEntities", "mvpScope",
    ]
    if state.get("projectType") == "regulatory":
        required += ["regulatoryRequirements", "auditAndCompliance"]
    elif state.get("projectType") == "non-regulatory":
        required += ["integrations", "nonFunctionalRequirements"]
    else:
        return False  # path not even decided yet

    if not all(filled(k) for k in required):
        return False
    if state.get("missingDetails"):  # still has open gaps
        return False
    return int(state.get("completenessScore", 0)) >= 90


def _generate_doc(state: Dict[str, Any], docs: str, doc_kind: str, sections: str) -> str:
    is_reg = state.get("projectType") == "regulatory"
    reg_note = (
        "This IS a regulatory project — give full weight to compliance, controls, audit, and risk."
        if is_reg
        else "This is a non-regulatory project — keep regulatory/compliance sections light or omit if not applicable."
    )
    prompt = f"""You are a senior business analyst. Using the structured requirement state below, write a
clean, professional {doc_kind} in GitHub-flavored Markdown. {reg_note}

Be concrete and specific — pull real detail from the requirement state. Where the state contains an item
prefixed "ASSUMPTION:", clearly label it as an assumption in the document. Do not invent regulations.
Use ## headings for each section, bullet lists, and tables where helpful.

=== REQUIREMENT STATE (JSON) ===
{json.dumps(state, indent=2)}

=== SUPPORTING DOCUMENT CONTEXT ===
{docs or "(no source documents)"}

Write the {doc_kind} now with these sections:
{sections}

Return ONLY the Markdown document (no preamble, no code fences)."""

    cached = _cache_get("doc-generation", prompt)
    if cached is not None:
        return cached

    model = _init_onboarding_model()
    cfg = load_config()
    max_retries = int(cfg.get("max_retries", 3))
    retry_delay = int(cfg.get("retry_delay", 3))
    last_error = None
    for attempt in range(max_retries):
        try:
            resp = model.generate_content(prompt)
            text = (resp.text or "").strip()
            text = re.sub(r"^```(?:markdown)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            if text:
                _cache_set("doc-generation", prompt, text)
                return text
        except Exception as e:  # noqa: BLE001
            last_error = str(e)
            logger.error("%s generation attempt %s failed: %s", doc_kind, attempt + 1, last_error)
            time.sleep(retry_delay)
    raise Exception(f"{doc_kind} generation failed: {last_error}")


def create_requirements_engine_router() -> APIRouter:
    router = APIRouter()

    @router.post("/extract")
    async def extract_text(
        files: List[UploadFile] = File(...),
        doc_types: List[str] = Form(...),
    ):
        results: List[Dict[str, Any]] = []
        for file, doc_type in zip(files, doc_types):
            contents = await file.read()
            if len(contents) > MAX_FILE_SIZE:
                raise HTTPException(status_code=400, detail=f"File {file.filename} is too large (>{MAX_FILE_SIZE} bytes).")
            if not (file.filename or "").lower().endswith(".pdf"):
                raise HTTPException(status_code=400, detail=f"File {file.filename} is not a PDF.")
            try:
                pages_text = extract_pdf_pages(contents, file.filename or "document.pdf")
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=f"Error processing file: {sanitize_error(str(exc))}") from exc
            for i, text in enumerate(pages_text):
                if text.strip():
                    results.append({"doc_type": doc_type, "page": i + 1, "text": text.strip()})
        return results

    @router.post("/onboarding/step")
    async def onboarding_step(request: OnboardingStepRequest):
        try:
            result = _call_gemini_json(_onboarding_prompt(request))
            state = _coerce_state(result.get("state"))
            questions = result.get("questions") or []
            if not isinstance(questions, list):
                questions = [str(questions)]
            questions = [str(q) for q in questions][:1]
            ready = bool(result.get("readyToGenerate")) and _coverage_complete(state)
            return {
                "success": True,
                "state": state,
                "classificationReasoning": result.get("classificationReasoning", ""),
                "assistantMessage": result.get("assistantMessage", ""),
                "questions": questions,
                "readyToGenerate": ready,
            }
        except Exception as e:  # noqa: BLE001
            logger.error("Error in onboarding step: %s", e, exc_info=True)
            return JSONResponse(status_code=500, content={"success": False, "error": sanitize_error(str(e))})

    @router.post("/onboarding/generate")
    async def onboarding_generate(request: OnboardingGenerateRequest):
        try:
            state = _coerce_state(request.state)
            docs = _documents_context(request.documents)

            brd_sections = """- Executive Summary
- Business Problem
- Business Objectives
- Stakeholders
- Current Process
- Proposed Solution
- Scope (In / Out)
- Assumptions
- Dependencies
- Risks
- Success Metrics
- Regulatory Impact (only if applicable)"""

            frd_sections = """- System Overview
- User Roles
- Functional Modules
- User Stories
- Workflows
- Data Requirements
- Integration Requirements
- Permission Rules
- Error Handling
- Acceptance Criteria
- Regulatory Controls (only if applicable)"""

            summary_sections = """- What the App Is
- Who It Is For
- What Problem It Solves
- Main Modules
- Main User Flow
- MVP Scope
- Future Scope
- Important Assumptions
- Prototype-Ready Summary (a tight paragraph a prototype engine can consume directly)"""

            brd = _generate_doc(state, docs, "Business Requirements Document (BRD)", brd_sections)
            frd = _generate_doc(state, docs, "Functional Requirements Document (FRD)", frd_sections)
            summary = _generate_doc(state, docs, "Application Summary", summary_sections)

            return {"success": True, "brd": brd, "frd": frd, "summary": summary}
        except Exception as e:  # noqa: BLE001
            logger.error("Error generating onboarding documents: %s", e, exc_info=True)
            return JSONResponse(status_code=500, content={"success": False, "error": sanitize_error(str(e))})

    return router

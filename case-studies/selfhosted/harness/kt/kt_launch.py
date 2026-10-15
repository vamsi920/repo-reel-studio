"""Starts the vendored KT (DeepWiki) service with a working OpenAI-compatible
chat client for provider "litellm".

The vendored api/clients/litellm.py subclasses adalflow's OpenAIClient, which
in the locked adalflow 1.1.3 no longer accepts `chat_completion_parser` /
`env_base_url_name` and only speaks the Responses API, so the service's
litellm/openai providers fail at construction. This shim replaces that one
class at runtime (no vendored file is edited) with a plain Chat Completions
streaming client pointed at LITELLM_BASE_URL.

Round 2 addition (attribution only, prompts and payloads unchanged): when
KT_TAG_KIND=1, each call's gateway tag gets the call kind appended, so
LITELLM_BASE_URL=http://127.0.0.1:18800/kt__gen-ky/v1 sends a page call to
http://127.0.0.1:18800/kt__gen-ky-page/v1. Kinds are classified from the
prompt exactly like round 1's metering proxy: planner, structure,
supplement, page, answer.
"""
import os
import sys

sys.path.insert(0, os.getcwd())

from openai import AsyncOpenAI  # noqa: E402

import api.clients  # noqa: E402

BASE = os.environ["LITELLM_BASE_URL"].rstrip("/")
TAG_KIND = os.environ.get("KT_TAG_KIND") == "1"
THINKING = os.environ.get("KT_THINKING")


def classify(prompt: str) -> str:
    if "You are choosing which files an engineer must read" in prompt:
        return "planner"
    if "create a wiki structure for it" in prompt:
        return "structure"
    if "You are completing the technical wiki page" in prompt:
        return "supplement"
    if "You are an expert technical writer and software architect" in prompt:
        return "page"
    return "answer"


_clients: dict = {}


def client_for(kind: str) -> AsyncOpenAI:
    url = BASE
    if TAG_KIND and url.endswith("/v1"):
        url = f"{url[:-3]}-{kind}/v1"
    if url not in _clients:
        _clients[url] = AsyncOpenAI(
            api_key=os.environ.get("LITELLM_API_KEY", "dummy"),
            base_url=url,
            timeout=3600,
            max_retries=2,
        )
    return _clients[url]


class ChatCompletionsClient:
    def __init__(self, *args, **kwargs):
        pass

    def convert_inputs_to_api_kwargs(self, input=None, model_kwargs=None, model_type=None):
        return {**(model_kwargs or {}), "messages": [{"role": "user", "content": input}]}

    async def acall(self, api_kwargs=None, model_type=None):
        prompt = api_kwargs["messages"][0]["content"] if api_kwargs.get("messages") else ""
        if THINKING in ("0", "1"):
            api_kwargs = {**api_kwargs, "extra_body": {"chat_template_kwargs": {"thinking": THINKING == "1"}}}
        return await client_for(classify(str(prompt))).chat.completions.create(**api_kwargs)


api.clients.LiteLLMClient = ChatCompletionsClient

import uvicorn  # noqa: E402

uvicorn.run("api.main:app", host="127.0.0.1", port=int(os.environ["PORT"]))

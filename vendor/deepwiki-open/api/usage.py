"""Per-task LLM usage + cost metering.

Every wiki task runs inside an asyncio task; ``start_usage_meter`` binds a
mutable ``UsageMeter`` to a ContextVar there, and every child task spawned
from it (``asyncio.gather`` / ``create_task`` copy the context) records into
the same object. Callers outside a metered task record into nothing.

Token counts for generation come from the provider's own ``usage_metadata``.
Embedding token counts are estimated with tiktoken (Gemini's embed API does
not report usage) and are flagged as estimated.

Prices are USD per 1M tokens, list price, and are kept here so the cost a
task reports is reproducible from its token counts.
"""

from __future__ import annotations

import contextvars
import threading
from dataclasses import dataclass, field

# USD per 1M tokens. (input, output) — output includes thinking tokens.
# Gemini 2.5 Pro has a higher tier above 200k prompt tokens.
MODEL_PRICES: dict[str, dict[str, float]] = {
    "gemini-2.5-pro": {"input": 1.25, "output": 10.0, "input_long": 2.50, "output_long": 15.0},
    "gemini-2.5-flash": {"input": 0.30, "output": 2.50},
    "gemini-2.5-flash-lite": {"input": 0.10, "output": 0.40},
    "gemini-embedding-001": {"input": 0.15, "output": 0.0},
}
LONG_CONTEXT_THRESHOLD = 200_000


def price_call(model: str, prompt_tokens: int, output_tokens: int) -> float | None:
    prices = MODEL_PRICES.get(model)
    if prices is None:
        return None
    long_ctx = prompt_tokens > LONG_CONTEXT_THRESHOLD and "input_long" in prices
    p_in = prices["input_long"] if long_ctx else prices["input"]
    p_out = prices.get("output_long", prices["output"]) if long_ctx else prices["output"]
    return (prompt_tokens * p_in + output_tokens * p_out) / 1_000_000


@dataclass
class ModelUsage:
    calls: int = 0
    prompt_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    cost_usd: float = 0.0
    estimated: bool = False
    unpriced_calls: int = 0


@dataclass
class UsageMeter:
    by_model: dict[str, ModelUsage] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def record(
        self,
        model: str,
        prompt_tokens: int,
        output_tokens: int,
        thinking_tokens: int = 0,
        *,
        estimated: bool = False,
    ) -> None:
        cost = price_call(model, prompt_tokens, output_tokens + thinking_tokens)
        with self._lock:
            u = self.by_model.setdefault(model, ModelUsage())
            u.calls += 1
            u.prompt_tokens += prompt_tokens
            u.output_tokens += output_tokens
            u.thinking_tokens += thinking_tokens
            u.estimated = u.estimated or estimated
            if cost is None:
                u.unpriced_calls += 1
            else:
                u.cost_usd += cost

    def to_dict(self) -> dict:
        with self._lock:
            models = {
                name: {
                    "calls": u.calls,
                    "prompt_tokens": u.prompt_tokens,
                    "output_tokens": u.output_tokens,
                    "thinking_tokens": u.thinking_tokens,
                    "cost_usd": round(u.cost_usd, 6),
                    "estimated": u.estimated,
                    "unpriced_calls": u.unpriced_calls,
                }
                for name, u in self.by_model.items()
            }
        return {
            "total_cost_usd": round(sum(m["cost_usd"] for m in models.values()), 6),
            "has_unpriced_calls": any(m["unpriced_calls"] for m in models.values()),
            "models": models,
        }


_current: contextvars.ContextVar[UsageMeter | None] = contextvars.ContextVar(
    "deepwiki_usage_meter", default=None
)


def start_usage_meter() -> UsageMeter:
    meter = UsageMeter()
    _current.set(meter)
    return meter


def current_usage_meter() -> UsageMeter | None:
    return _current.get()


def record_usage(
    model: str,
    prompt_tokens: int,
    output_tokens: int,
    thinking_tokens: int = 0,
    *,
    estimated: bool = False,
) -> None:
    meter = _current.get()
    if meter is not None:
        meter.record(
            model, prompt_tokens, output_tokens, thinking_tokens, estimated=estimated
        )

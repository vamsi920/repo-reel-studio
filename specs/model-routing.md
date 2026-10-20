# Model Routing Specs

Auto mode picks which saved LLM profile handles each request. Routing is
app-side (`src/lib/model-routing/`): the pinned agent-server has no
meta-profile router, so decisions are applied through the existing
per-conversation `switchProfile` → `switchLLM` path.

---

### MR-001: Modes, policies and tiers
- [x] Routing mode is `auto` or `manual`; policy is `quality`, `balanced` or `economy`; models fall into `light`, `standard`, `frontier` tiers.
- [x] The default mode is `manual`, so nothing changes until a user opts in.

### MR-002: Capability catalog
- [x] Model capabilities (tier, vision, tool calling, context window) resolve by longest family-fragment match; unknown models get conservative defaults (standard, no vision, 128k).
- [x] Non-secret profile config (`max_input_tokens`, `disable_vision`, `native_tool_calling`) refines the catalog.

### MR-003 / MR-004: Prompt features and complexity score
- [x] Scoring uses only the user's own text — never the injected memory or KT blocks.
- [x] A weighted score in 0..1 is compared with policy thresholds (frontier at 0.35 / 0.55 / 0.75; standard 0.25 below that).

### MR-005: Health circuit breaker
- [x] Rate limits open a profile's circuit immediately (provider retry hints respected, else 60 s doubling to 10 min); outages/timeouts open it after 3 consecutive failures; auth failures keep it out until reset.
- [x] Context-window and bad-request errors do not count against provider health.
- [x] Health is recorded in manual mode too.

### MR-006: Selection policy and budget
- [x] Candidates rank by tier fit, then health, then cost (capability for `quality`), then observed latency.
- [x] At 80% of the per-conversation budget Auto drops one tier; at 100% it uses the light tier.

### MR-007: Hysteresis
- [x] Upgrades apply immediately; downgrades need two consecutive lighter verdicts, ≥3 turns or 5 minutes since the last switch, and a 0.15 score margin. Same-tier alternatives never displace the current profile (prompt cache).
- [x] Capability-forced switches (images, context fit, tools) bypass hysteresis.

### MR-008: Fallback
- [x] In Auto, a retryable LLM error (rate limit, outage, timeout, context overflow) switches to the next healthy profile and resumes the run (`POST /run`) without resending the message — at most 2 hops per user turn.
- [x] Auth and bad-request errors are never retried automatically.

### MR-009: Ambiguity classifier
- [x] Only scores within ±0.08 of a tier boundary consult the classifier (the `ai-guide` Edge Function in `route_classify` mode), with a 1.5 s timeout, LRU cache and 20 calls/hour cap. Any failure defers to the scorer.
- [x] The classifier key stays server-side; only the truncated user message is sent.

### MR-010: Hard rules
- [x] A manual pick always wins (even over exclusions and open circuits).
- [x] Excluded profiles are never chosen by Auto.
- [x] Slash commands and trivial follow-ups keep the current profile.

### MR-011: Store
- [x] Health, hysteresis, the decision log (200 entries) and per-chat mode persist in localStorage, reset on backend change, and never contain prompt text or secrets.

### MR-012: App-side calls
- [x] KT generation and KT Ask route to the frontier tier, Mermaid repair and narration to the light tier, over DeepWiki-servable models only (`VITE_DEEPWIKI_PROVIDERS`).
- [x] Only provider and model names reach DeepWiki; a 429/5xx retries once on another model.

### MR-013 / MR-014: Chat runtime
- [x] In Auto, each user turn is routed before it is sent; a switch that fails or exceeds 3 s lets the turn go out on the current model.
- [x] No switch happens while the agent is running, for ACP agents, or in manual mode.

### MR-015 / MR-016: Visibility
- [x] Auto switches and fallbacks render an expandable "Auto switched to X" note listing the reasons, tier and score.
- [x] Decisions are posted to the AgentOps run audit (`POST /api/agentops/runs/:id/routing`, allowlisted fields only, 4 KB cap) and tracked as `model_routed` / `model_fallback` (switches and fallbacks only).

### MR-017 / MR-018: Mode and settings
- [x] Effective mode = per-chat override → global `model_routing_mode` → manual. Picking a named profile sets the scope to manual; `/model auto` or the picker's Auto row sets it to auto.
- [x] Settings → LLM Profiles exposes the Auto default, policy, budget, per-profile inclusion, live health and recent decisions; preferences persist in `misc_settings.app_preferences`.

### MR-019: Conversation start
- [x] With Auto on, a new conversation's first message is routed before creation and the run starts on the chosen profile's encrypted LLM config; without encrypted export it starts on the active profile.

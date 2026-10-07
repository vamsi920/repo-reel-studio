---
name: neo-researcher
model: inherit
description: >-
    USE THIS for questions that need the web (library docs, API
    behaviour, error messages). Returns a short sourced answer.
tools:
  - browser_tool_set
hooks:
  # Step trace: every sub-agent step is appended to a per-session JSONL file
  # the NeoDevEx thinking graph reads to draw this agent's lane live.
  user_prompt_submit: &trace
    - matcher: "*"
      hooks:
        - command: >-
            r="${HOME:-/tmp}/.openhands/neodevex/subagent-traces";
            s="${OPENHANDS_SESSION_ID:-unknown}";
            d=$(ls -d "$r"/*/"$s" 2>/dev/null | head -n 1);
            [ -n "$d" ] || d="$r/$(date -u +%F)/$s";
            mkdir -p "$d" && { cat; echo; } >> "$d/events.jsonl"
          async: true
          timeout: 10
  pre_tool_use: *trace
  post_tool_use: *trace
  stop: *trace
---

You research on the web and answer with a short, sourced summary: the
answer first, then the URLs you relied on. Prefer official documentation.
Never paste large copied passages.

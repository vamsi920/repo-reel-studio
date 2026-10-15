"""Dump the NeoDevEx agent's real first model request (system prompt, tool
schemas and a chat-bench task) to JSON, for loadtest.py. No model is called.

    CHAT_BENCH_TEMPLATES=... python dump_first_turn.py out.json [TASK]
"""
import json
import os
import sys
import tempfile
from pathlib import Path

BENCH = Path("/Users/vamsi/Desktop/neodevex/repo-reel-studio/case-studies/chat/bench")
sys.path.insert(0, str(BENCH))
os.chdir(BENCH)
os.environ.setdefault("OPENHANDS_SUPPRESS_BANNER", "1")

import run_chat  # noqa: E402
from openhands.sdk import Conversation  # noqa: E402
from openhands.sdk.event import LLMConvertibleEvent  # noqa: E402

out, task_id = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "F1")
task = {t["id"]: t for t in run_chat.TASKS["tasks"]}[task_id]
settings = json.loads((BENCH / "out/settings-rules-v4.json").read_text())
settings["llm"] = {"model": "openai/deepseek-v4-flash", "api_key": "x", "stream": False}
settings["tools"] = [t for t in settings["tools"] if t["name"] != "browser_tool_set"]
agent = run_chat.OpenHandsAgentSettings.model_validate(settings).create_agent()
conv = Conversation(agent=agent, workspace=tempfile.mkdtemp(), visualizer=None)
conv.send_message(task["prompt"])
if hasattr(agent, "_initialize"):
    agent._initialize(conv._state)
events = [e for e in conv.state.events if isinstance(e, LLMConvertibleEvent)]
msgs = agent.llm.format_messages_for_llm(LLMConvertibleEvent.events_to_messages(events))
tools = [t.to_openai_tool() for t in agent.tools_map.values()]
json.dump({"task": task_id, "messages": msgs, "tools": tools}, open(out, "w"))
print(out, "messages", len(msgs), "tools", [t["function"]["name"] for t in tools],
      "chars", sum(len(json.dumps(m)) for m in msgs) + len(json.dumps(tools)))

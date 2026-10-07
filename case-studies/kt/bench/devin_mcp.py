"""Minimal client for the public DeepWiki MCP server (Devin's wiki and Ask)."""
import json
import sys
import urllib.request

URL = "https://mcp.deepwiki.com/mcp"
HEADERS = {"content-type": "application/json", "accept": "application/json, text/event-stream"}


def _rpc(method, params, sid=None, id_=1):
    headers = dict(HEADERS)
    if sid:
        headers["mcp-session-id"] = sid
    body = json.dumps({"jsonrpc": "2.0", "id": id_, "method": method, "params": params}).encode()
    with urllib.request.urlopen(urllib.request.Request(URL, body, headers), timeout=600) as r:
        sid = r.headers.get("mcp-session-id") or sid
        text = r.read().decode()
    for line in text.splitlines():
        if line.startswith("data:"):
            return json.loads(line[5:]), sid
    return json.loads(text), sid


def call(tool, args):
    """Call one MCP tool and return its text content."""
    _, sid = _rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                                 "clientInfo": {"name": "neodevex-bench", "version": "1"}})
    res, _ = _rpc("tools/call", {"name": tool, "arguments": args}, sid, 2)
    if "result" not in res:
        raise RuntimeError(json.dumps(res)[:300])
    return "\n".join(c.get("text", "") for c in res["result"]["content"]).strip()


if __name__ == "__main__":
    print(call(sys.argv[1], json.loads(sys.argv[2])))

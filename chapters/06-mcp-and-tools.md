---
title: MCP and the tool layer
status: draft
verified: 2026-08-26
sources:
  - https://modelcontextprotocol.io/docs/learn/architecture
  - https://modelcontextprotocol.io/docs/develop/build-server
  - https://code.claude.com/docs/en/mcp
  - https://www.anthropic.com/engineering/writing-tools-for-agents
  - https://www.anthropic.com/engineering/code-execution-with-mcp
---

MCP is how Claude reaches past the filesystem and shell into the rest of your stack.

## The architecture in one screen

MCP is a client-server protocol over JSON-RPC 2.0. The host (Claude Code) creates
one MCP client per configured server; each client holds a dedicated connection.
Servers expose three primitives: **tools** (functions the model can call),
**resources** (data the client can read), and **prompts** (reusable templates —
these surface in Claude Code as `/mcp__servername__promptname` slash commands).

Two transports matter:

- **stdio** — the server is a local process; messages go over stdin/stdout. No
  network, no auth layer, best latency. Use for anything that runs on your machine.
- **Streamable HTTP** — HTTP POST with optional server-sent events for streaming.
  Use for remote services; supports OAuth, bearer tokens, and custom headers. Plain
  SSE as a transport is deprecated — use `--transport sse` only when a service
  exposes nothing else.

```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
claude mcp add --transport stdio airtable --env AIRTABLE_API_KEY=KEY -- npx -y airtable-mcp-server
```

For stdio servers, everything after `--` is the server's own command line;
Claude Code's flags (`--scope`, `--env`, `--transport`) go before it.

## Three scopes, strict precedence

| Scope | Stored in | Shared | Use for |
|---|---|---|---|
| local (default) | `~/.claude.json`, keyed to this project | no | credentials, experiments |
| project | `.mcp.json` at project root, committed | yes | the team's shared tools |
| user | `~/.claude.json`, all projects | no | personal cross-project utilities |

When the same server name appears in several scopes, Claude Code takes the entire
entry from the highest-precedence source — local, then project, then user, then
plugins, then claude.ai connectors. Fields are never merged across scopes, so you
cannot override just the `env` of a project server with a local entry; you replace
the whole definition.

Project-scoped servers require an interactive approval prompt on first use.

> [!CAUTION] Headless skips the approval prompt
> `claude -p`, Agent SDK sessions, and cloud sessions cannot show the `.mcp.json`
> approval dialog — they load project-scoped servers without asking. In a cloned
> repo that means someone else's server config runs with no gate. Block specific
> servers with `disabledMcpjsonServers`, or exclude project settings entirely with
> `--setting-sources`.

## When a CLI beats an MCP server

An MCP server is not automatically the right integration. A CLI called through
Bash costs zero schema tokens — `gh`, `psql`, `aws`, and `stripe` are already
documented in the model's weights, compose with pipes, and let Claude filter
output with `grep` and `jq` before it ever enters context. An MCP tool's schema
is loaded into context, and every intermediate result must pass through the
model. Anthropic's own engineering measurement: an agent wired to thousands of
MCP tools processes hundreds of thousands of tokens of tool definitions before
it even reads the request. Their fix was code execution against a filesystem
of tool definitions — the agent lists `./servers/` and reads only the files
it needs for the task at hand — which cut one Google Drive-to-Salesforce
workflow from 150,000 tokens to 2,000, a 98.7% reduction. That number comes
from loading fewer tool definitions, not from filtering data server-side;
letting the execution environment filter a result before it reaches the model
is a separate benefit of the same technique, not what produced this figure.

> [!PATTERN] CLI first
> If a capable CLI exists, use it and skip the server. Reach for MCP when you
> need what Bash cannot give you: OAuth flows to remote services, a service with
> no CLI, typed results a hook must match on, or a server that pushes events into
> the session as a channel. "There's an MCP server for it" is not a reason.

## Tool definitions are the lever

The quality of a tool's definition dominates how well the model uses it. This is
prompt engineering, not API design, and Anthropic's tool-writing guidance is
specific:

- **Namespace by service and resource.** `asana_projects_search` and
  `asana_users_search`, not `search`. Agents choose among dozens of tools; the
  name carries most of the signal.
- **Name parameters so they cannot be misread.** `user_id`, not `user` — the
  model will otherwise pass a name where you wanted an ID.
- **Write descriptions for a new hire.** Everything you know implicitly — ID
  formats, when *not* to use the tool, what the output looks like — goes in the
  description, because the model has none of your context.
- **Consolidate workflows.** One `schedule_event` tool that finds users and books
  the slot internally beats `list_users` + `list_events` + `create_event`. Every
  intermediate result you keep out of context is tokens saved and an error path
  removed.
- **Make errors teach.** A traceback teaches nothing. Return "date must be
  ISO 8601, e.g. 2026-08-26" and the model self-corrects on the next call.
- **Offer a `response_format` enum.** Anthropic's example: `detailed` returns
  206 tokens, `concise` returns 72. Default to concise; let the agent ask for
  more.

Claude Code enforces the output side for you: MCP tool responses are limited to
25,000 tokens by default (warning at 10,000; raise with `MAX_MCP_OUTPUT_TOKENS`).
A server that dumps raw API JSON hits that wall constantly — paginate and filter
server-side instead.

## Tool naming

MCP tools are named `mcp__<server>__<tool>`; plugin-bundled servers use a scoped
segment such as `mcp__plugin_<plugin>_<server>__<tool>`. This matters because hook
matchers are regexes over those names — `mcp__github__.*` scopes to one server,
`mcp__.*__write.*` cuts across all of them. A matcher written against the bare
server key never fires for a plugin-bundled server — you must include the
`plugin_<plugin-name>_` segment.

## Deferred loading: tool search

Tool search is on by default and is why "too many MCP tools" stopped being a
context problem: only tool *names* and server instructions load at session start,
and full schemas are fetched by a `ToolSearch` call when Claude actually needs
them. Two settings most people miss:

- `ENABLE_TOOL_SEARCH=auto:5` — threshold mode. Tools load upfront while their
  definitions total under 5% of the context window, and defer once they cross it
  (`auto` alone uses 10%). Upfront tools skip the search round-trip, so this is
  the right setting when you run one or two small servers.
- `"alwaysLoad": true` on a server entry pins that server's tools into context
  regardless of tool search — for the handful of tools Claude needs every turn.
  A server can pin a single tool by setting `"anthropic/alwaysLoad": true` in
  that tool's `_meta`.

If you author a server, the *server instructions* field is now doing the job a
skill description does: it is what Claude reads to decide whether to search your
tools at all. State the task category, the trigger conditions, and the key
capabilities. Claude Code truncates tool descriptions and server instructions at
2KB each — front-load the critical part.

## Trust is the price of admission

An MCP server ships text that goes straight into the model's context, which makes
it a supply chain: tool *descriptions* can carry hidden instructions (tool
poisoning), and a malicious server can shadow the behaviour of a trusted one.
Claude Code prompts for trust on first use of a new server, but that dialog rates
the server as of that moment — a `tools/list_changed` notification can swap in
different definitions later. Write permission rules against exact tool names
(`mcp__github__search_issues`, not `mcp__github__.*`), and give each agent only
the servers its task needs. The full treatment — including the lethal-trifecta
framing that decides which servers may coexist in one session — is in the Agent
security chapter.

## Building your own

The official Python SDK generates the schema from type hints and the description
from the docstring, so a minimal server is one file:

```python
# weather.py — install with: uv add "mcp[cli]"
from mcp.server import MCPServer

mcp = MCPServer("weather")

@mcp.tool()
async def get_alerts(state: str) -> str:
    """Get weather alerts for a US state.

    Args:
        state: Two-letter US state code (e.g. CA, NY)
    """
    data = await fetch_alerts(state)          # your API call
    if not data:
        return "Unable to fetch alerts or no alerts found."
    return format_alerts(data)                # readable text, not raw JSON

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

```bash
claude mcp add --transport stdio weather -- uv run /path/to/weather.py
```

Everything above about definitions applies here: the docstring is the tool
description, the parameter names are the interface, and returning formatted text
instead of raw JSON is the difference between a tool Claude uses well and one it
fights. Log to stderr, never stdout — stdout is the transport.

> [!CAUTION] Long calls have two clocks
> A per-server `"timeout"` field in `.mcp.json` (milliseconds, e.g. `600000`) is a
> hard wall-clock cap per tool call; progress notifications don't extend it. Set
> it below 1000 and it's ignored — Claude Code falls through to
> `MCP_TOOL_TIMEOUT`, whose own default is roughly 28 hours when unset.
> Separately, a call that stays silent — no response, no progress — aborts on an
> idle timeout: five minutes for HTTP/SSE/WebSocket servers, 30 for stdio. A slow
> server that never reports progress dies at the idle wall long before the
> wall-clock one. The idle timeout requires Claude Code v2.1.187 or later.

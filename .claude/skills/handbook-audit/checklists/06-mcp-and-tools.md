---
source: chapters/06-mcp-and-tools.md
source-verified: 2026-08-26
source-hash: 1d6c20492b37
extracted: 2026-08-27
gate: mcp
---

# MCP and the tool layer — audit checklist

Distilled from chapters/06-mcp-and-tools.md. Gated on `mcp`: a target with no
`.mcp.json` and no MCP permission rules skips this file entirely rather than
reporting a page of absences.

<!-- Four of this chapter's checkable claims are owned by 14-agent-security.md
and are deliberately absent here: server version pinning (SC-02), diffing tool
descriptions against a stored hash (SC-03), permission rules naming exact tools
rather than server wildcards (SC-04), and headless runs loading project servers
without the trust prompt (SC-05). Secret-shaped strings in `.mcp.json` are
SC-12. Do not reintroduce any of them on re-extraction, or a single misconfig
double-reports. -->

### MC-01: A project-scope `.mcp.json` is committed

- severity: caution
- missing-is: n/a
- check: If `.mcp.json` exists at the target root, confirm
  `git ls-files .mcp.json` is non-empty. Flag an untracked file: project scope
  exists to share servers with the team, and an untracked `.mcp.json` gives
  every clone a different tool layer while looking like shared config. A server
  meant to stay personal belongs in local scope (`claude mcp add` without
  `--scope project`), not in an uncommitted project file.
- source-line: "project | `.mcp.json` at project root, committed | yes | the
  team's shared tools"
- why: chapters/06-mcp-and-tools.md > "Three scopes, strict precedence"

### MC-02: No server uses the deprecated SSE transport without a reason

- severity: note
- missing-is: n/a
- check: Grep `.mcp.json` for `"type": "sse"` or `--transport sse`. For each
  hit, grep CLAUDE.md and memory files for a recorded reason. Note undocumented
  hits: plain SSE is deprecated as a transport and is correct only when the
  service exposes nothing else.
- source-line: "Plain SSE as a transport is deprecated — use `--transport sse`
  only when a service exposes nothing else."
- why: chapters/06-mcp-and-tools.md > "The architecture in one screen"

### MC-03: Per-server timeouts are above the silent-ignore floor

- severity: caution
- missing-is: n/a
- check: Read every `"timeout"` field in `.mcp.json` and flag any value below
  1000. The field is milliseconds and values under 1000 are ignored outright:
  the server falls through to `MCP_TOOL_TIMEOUT`, whose unset default is
  roughly 28 hours. A `"timeout": 30` reads as a tight leash and is in fact no
  leash at all. Values above 1000 are correct as written; do not flag them for
  being large.
- source-line: "Set it below 1000 and it's ignored — Claude Code falls through
  to `MCP_TOOL_TIMEOUT`, whose own default is roughly 28 hours when unset."
- why: chapters/06-mcp-and-tools.md > "Building your own" (caution callout)

### MC-04: No server duplicates a capable CLI

- severity: caution
- missing-is: n/a
- check: For each server in `.mcp.json`, compare its name and command against
  the CLIs the model already knows — `gh`, `psql`, `aws`, `stripe`, `docker`,
  `kubectl`. Flag servers that wrap one of these for work Bash already does.
  Every MCP tool's schema is loaded into context and every intermediate result
  passes through the model, while a CLI costs zero schema tokens and can be
  filtered with `grep` and `jq` before anything enters context. A server earns
  its place with what Bash cannot give: OAuth to a remote service, a service
  with no CLI, typed results a hook matches on, or an event channel into the
  session — record which, and drop the finding when the repo does.
- source-line: "If a capable CLI exists, use it and skip the server."
- why: chapters/06-mcp-and-tools.md > "When a CLI beats an MCP server" (pattern
  callout)

### MC-05: Hook matchers on MCP tools carry the plugin segment

- severity: caution
- applies: hooks
- missing-is: n/a
- check: For each hook matcher in settings that targets an MCP tool name, check
  whether the server it names is plugin-bundled. Plugin servers are named
  `mcp__plugin_<plugin>_<server>__<tool>`, so a matcher written against the
  bare server key never fires for one — it is a hook that looks configured and
  is dead. Raise to `warning` only when the dead matcher is the sole gate on an
  irreversible action, since the repo then believes it is guarded and is not.
  A matcher on a non-plugin server needs no segment; do not flag it.
- source-line: "A matcher written against the bare server key never fires for a
  plugin-bundled server."
- why: chapters/06-mcp-and-tools.md > "Tool naming"

### MC-06: `alwaysLoad` does not defeat tool search wholesale

- severity: note
- missing-is: n/a
- check: Count servers in `.mcp.json` setting `"alwaysLoad": true`. Note a
  single pinned server; raise to `caution` at two or more, which pins enough
  schema upfront to defeat the deferred loading that keeps a large tool layer
  from being a context problem. Tool-level pins
  (`"anthropic/alwaysLoad": true` in a tool's `_meta`) are the finer instrument
  and always pass — mention them only to suggest replacing a server-level pin.
  Do not judge whether a server has "too many tools": `.mcp.json` lists servers,
  not tools, so that count is not knowable from config and a check that
  pretends otherwise fires on everything.
- source-line: "`\"alwaysLoad\": true` on a server entry pins that server's
  tools into context regardless of tool search"
- why: chapters/06-mcp-and-tools.md > "Deferred loading: tool search"

### MC-07: Repo-authored stdio servers log to stderr

- severity: caution
- missing-is: n/a
- check: For each stdio server in `.mcp.json` whose command points at a file
  inside the target repo, read that file and grep for writes to stdout —
  `print(` without `file=sys.stderr`, `console.log`, `fmt.Println`. Flag them:
  stdout is the transport, so a stray log line corrupts the JSON-RPC stream.
  Skip (n/a) when every server command points outside the repo — a vendored or
  `npx`-fetched server is not this repo's code to judge.
- source-line: "Log to stderr, never stdout — stdout is the transport."
- why: chapters/06-mcp-and-tools.md > "Building your own"

---
title: MCP and the tool layer
status: stub
verified: 2026-08-26
---

MCP is how Claude reaches past the filesystem and shell into the rest of your stack.

## Servers in use

*To capture:* which servers you actually run, scoped per project versus globally, and
what each one is genuinely worth.

## Tool naming

MCP tools are named `mcp__<server>__<tool>`; plugin-bundled servers use a scoped
segment such as `mcp__plugin_<plugin>_<server>__<tool>`. This matters because hook
matchers are regexes over those names — `mcp__github__.*` scopes to one server,
`mcp__.*__write.*` cuts across all of them.

## Guardrails

*To capture:* the `PreToolUse` matchers you use to gate write-capable MCP tools, and
anything you learned about permission prompts on connector tools.

## Building your own

*To capture:* when a custom MCP server beat a shell script, and when it didn't.

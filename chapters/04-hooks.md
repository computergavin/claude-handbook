---
title: Hooks
status: stable
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/en/hooks-guide
---

Hooks are commands Claude Code runs at fixed points in its lifecycle. They exist so
that certain things always happen instead of depending on the model choosing to do
them.

That sentence is the whole chapter. Instructions are advisory; hooks are the control
plane.

> [!PATTERN] The 100% rule
> Anything that must happen every single time is a hook, not an instruction. Linting
> after edits, blocking destructive git commands, loading environment on directory
> change — all hooks.

## Where they live

| Location | Scope |
|---|---|
| `~/.claude/settings.json` | every project on this machine |
| `.claude/settings.json` | one project, committable |
| `.claude/settings.local.json` | one project, gitignored |
| managed policy settings | organization-wide, admin controlled |
| plugin `hooks/hooks.json` | whenever the plugin is enabled |
| skill or subagent front matter | scoped to that skill or agent |

`/hooks` lists everything currently registered, grouped by event. It's read-only —
edit the JSON, or ask Claude to.

## The events that earn their keep

There are roughly thirty. These are the ones worth setting up first.

- `PreToolUse` — fires before a tool call and can block it. The security checkpoint.
- `PostToolUse` — after success. Formatters, linters, logging.
- `UserPromptSubmit` — can inject context into every prompt before Claude sees it.
- `SessionStart` — matchers include `startup`, `resume`, `clear`, `compact`, `fork`.
- `Stop` / `SubagentStop` — can refuse to let the turn end.
- `PreCompact` / `PostCompact` — around context compaction.
- `FileChanged` / `CwdChanged` — react to the filesystem, whatever wrote it.
- `PermissionRequest` — auto-approve or deny specific prompts.

## Enforcement, not suggestion

`PreToolUse` hooks fire before any permission-mode check, in every permission mode.
A hook returning `deny` blocks the tool even under `bypassPermissions` or
`--dangerously-skip-permissions`.

The reverse does not hold: a hook returning `allow` cannot loosen a deny rule from
settings. Hooks tighten, never loosen.

> [!WARNING] This is your last line of defense
> Because a hook survives bypass mode, it is the only mechanism that holds when
> someone — including you at 1am — decides to skip permissions to move faster. Put
> the genuinely destructive commands here and nowhere else.

## Communication

Hooks read event JSON on stdin and answer through exit codes or structured stdout.

- **Exit 0** — no objection. For `PreToolUse` this does *not* approve; the normal
  permission flow still runs. For `UserPromptSubmit` and `SessionStart`, stdout is
  added to Claude's context as plain text.
- **Exit 2** — block. stderr becomes the feedback, usually shown to Claude so it can
  adjust.
- **Structured JSON on exit 0** — full control, including
  `permissionDecision` of `allow` / `deny` / `ask`, and
  `hookSpecificOutput.additionalContext` to inject text.

Pick one style per hook. Mixing exit-2 and JSON produces surprises.

## Beyond shell

Not every hook is a shell command. Four other types:

- `"type": "http"` — POST the event to an endpoint. Good for a shared team audit
  service.
- `"type": "mcp_tool"` — call a tool on a connected MCP server.
- `"type": "prompt"` — single-turn model evaluation, Haiku by default, for judgment
  calls that aren't deterministic rules.
- `"type": "agent"` — experimental. Spawns a subagent that can read files and run
  commands before returning a verdict. 60s default timeout, up to 50 tool turns.

## Three to install today

**Verify before stopping.** An agent hook that refuses to end the turn until the
tests actually pass:

```json
{"hooks":{"Stop":[{"hooks":[{"type":"agent",
  "prompt":"Verify all unit tests pass. Run the suite and check the results. $ARGUMENTS",
  "timeout":120}]}]}}
```

**Re-inject context after compaction.** Compaction summarizes the conversation and
can lose things that mattered. A `SessionStart` hook matched on `compact` puts them
back:

```json
{"hooks":{"SessionStart":[{"matcher":"compact","hooks":[{"type":"command",
  "command":"echo \"Conventions: see CLAUDE.md. Recent work:\" && git log --oneline -5"}]}]}}
```

**Protect files.** A `PreToolUse` hook on `Edit|Write` that exits 2 when the target
matches `.env`, `.git/`, or a lockfile. The blocked reason goes back to Claude, so it
adapts rather than retrying.

> [!CAUTION] The Stop hook block cap
> Claude Code overrides a `Stop` hook after it blocks eight consecutive times without
> progress. Parse `stop_hook_active` from stdin and exit early when it's true, or the
> loop burns tokens and then dies anyway.

## Debugging

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ./my-hook.sh; echo $?
claude --debug-file /tmp/claude.log      # then: tail -f /tmp/claude.log
```

The classic silent failure: a shell profile that unconditionally `echo`s something
prepends that output to your hook's JSON, so stdout no longer starts with `{`, so
the JSON is ignored as plain text with no error shown. Wrap profile echoes in an
interactive-shell check.

---
source: chapters/04-hooks.md
source-verified: 2026-08-26
source-hash: f8d2c8294456
extracted: 2026-08-27
gate: always
---

# Hooks checklist

Gate is `always`, not `hooks`: HK-01 and HK-13 compare CLAUDE.md instructions
against the hooks layer and must run even when the target has zero hooks — an
instruction-only guardrail is exactly the failure they exist to catch. Assertions
that inspect hook quality carry `applies: hooks` individually.

### HK-01: Irreversible-action rules in CLAUDE.md are backed by PreToolUse hooks
- severity: warning
- missing-is: finding
- check: Grep the target's root and nested CLAUDE.md for prohibitions on
  irreversible actions — `push`, `force-push`, `push --force`, `reset --hard`,
  `rebase`, `.env`, lockfile edits, `rm -rf`, deletion of branches or tags. For
  each match, grep `~`-level and project `settings.json` / `settings.local.json`
  hooks blocks and `.claude/hooks/*` scripts for a `PreToolUse` hook that blocks
  that action. Flag every prohibition with no corresponding hook. This is a
  finding even when the repo has other hooks, and a finding when the repo has no
  hooks at all.
- source-line: "Anything that must happen every single time is a hook, not an
  instruction."
- why: chapters/04-hooks.md > "The 100% rule" (pattern callout)

### HK-02: Blocking hooks emit the reason they blocked
- severity: caution
- applies: hooks
- missing-is: n/a
- check: For each script or inline command wired to `PreToolUse` or `Stop`, find
  every `exit 2` (or `sys.exit(2)` / `process.exit(2)`) and confirm a write to
  stderr precedes it; for JSON-style hooks, confirm the `deny` output carries a
  reason string. Flag any block path that produces no message — Claude retries
  blind.
- source-line: "The blocked reason goes back to Claude, so it adapts rather than
  retrying."
- why: chapters/04-hooks.md > "Three to install today"

### HK-03: One communication style per hook
- severity: caution
- applies: hooks
- missing-is: n/a
- check: For each hook script, grep for both an `exit 2` path and structured JSON
  output (`permissionDecision`, `hookSpecificOutput`). Flag scripts that use
  both styles.
- source-line: "Pick one style per hook. Mixing exit-2 and JSON produces
  surprises."
- why: chapters/04-hooks.md > "Communication"

### HK-04: Stop hooks handle stop_hook_active
- severity: caution
- applies: hooks
- missing-is: n/a
- check: For each `command`-type hook wired to `Stop` or `SubagentStop`, grep the
  script for `stop_hook_active`. Flag scripts that never read it — the loop
  burns tokens for eight blocks and is then overridden anyway.
- source-line: "Parse `stop_hook_active` from stdin and exit early when it's
  true"
- why: chapters/04-hooks.md > "The Stop hook block cap" (caution callout)

### HK-05: Policy hooks live in committed settings, not only local
- severity: caution
- applies: hooks
- missing-is: n/a
- check: Compare the `hooks` blocks of `.claude/settings.json` and
  `.claude/settings.local.json`. Flag any `PreToolUse` guard or `PostToolUse`
  enforcement hook that exists only in the gitignored local file — every fresh
  clone and every teammate runs without it.
- source-line: "one project, committable"
- why: chapters/04-hooks.md > "Where they live"

### HK-06: Hook event names are canonical
- severity: warning
- applies: hooks
- missing-is: n/a
- check: Compare every event key in each settings `hooks` block against the
  canonical list: SessionStart, Setup, UserPromptSubmit, UserPromptExpansion,
  PreToolUse, PermissionRequest, PermissionDenied, PostToolUse,
  PostToolUseFailure, PostToolBatch, Notification, MessageDisplay,
  SubagentStart, SubagentStop, TaskCreated, TaskCompleted, Stop, StopFailure,
  TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, DirectoryAdded,
  FileChanged, WorktreeCreate, WorktreeRemove, PreCompact, PostCompact,
  Elicitation, ElicitationResult, SessionEnd. Flag any other spelling — a hook
  registered on a nonexistent event never fires, and a guard that never fires
  is an open door.
- source-line: "There are roughly thirty."
- why: chapters/04-hooks.md > "The events that earn their keep"; canonical list
  in chapters/24-appendix.md > "Hook events, quick reference"

### HK-07: Hook config objects use only schema-valid keys
- severity: caution
- applies: hooks
- missing-is: n/a
- check: In each hook config object, compare keys against the documented set:
  `matcher`, `hooks`, `type`, `command`, `prompt`, `timeout`. Flag unknown keys
  such as `if` — they are silently ignored, so the hook fires more broadly than
  the author intended. Also confirm `SessionStart` matchers are drawn from
  `startup`, `resume`, `clear`, `compact`, `fork`.
- source-line: "matchers include `startup`, `resume`, `clear`, `compact`,
  `fork`."
- why: chapters/04-hooks.md > "The events that earn their keep"

### HK-08: No hook attempts to loosen a settings deny
- severity: caution
- applies: hooks
- missing-is: n/a
- check: Grep hook scripts and inline JSON for `"permissionDecision": "allow"`
  (or `allow` output paths). Compare each against the deny rules in
  `settings.json` / `settings.local.json` permissions. Flag any hook whose
  allow targets an action a deny rule covers — it silently does nothing.
- source-line: "Hooks tighten, never loosen."
- why: chapters/04-hooks.md > "Enforcement, not suggestion"

### HK-09: PreToolUse guard scripts read the event JSON from stdin
- severity: caution
- applies: hooks
- missing-is: n/a
- check: For each `command`-type `PreToolUse` hook script, grep for a stdin read
  (`jq`, `read`, `sys.stdin`, `process.stdin`, `cat -`, `$(cat)`). Flag scripts
  that never read stdin — they cannot see `tool_name` or `tool_input`, so they
  decide blind.
- source-line: "Hooks read event JSON on stdin and answer through exit codes or
  structured stdout."
- why: chapters/04-hooks.md > "Communication"

### HK-10: JSON-emitting hook scripts keep stdout clean
- severity: caution
- applies: hooks
- missing-is: n/a
- check: For each hook script that emits structured JSON, grep for `echo` or
  `print` statements to stdout that precede the JSON output (debug lines,
  banners). Flag them — stdout that does not start with `{` makes the JSON
  parse as plain text. Debug output belongs on stderr.
- source-line: "the JSON is ignored as plain text with no error shown"
- why: chapters/04-hooks.md > "Debugging"

### HK-11: Agent-type hooks set an explicit timeout
- severity: note
- applies: hooks
- missing-is: n/a
- check: For each hook object with `"type": "agent"`, check for a `timeout`
  field. Flag objects relying on the 60s default for work that plausibly runs
  longer, such as a test suite.
- source-line: "60s default timeout, up to 50 tool turns."
- why: chapters/04-hooks.md > "Beyond shell"

### HK-12: A SessionStart compact hook re-injects conventions
- severity: note
- missing-is: note
- check: Grep settings hooks blocks for a `SessionStart` entry with matcher
  `compact`. Absence is a note: compaction can drop conventions the repo's
  CLAUDE.md counts on, and the hook puts them back.
- source-line: "Compaction summarizes the conversation and can lose things that
  mattered."
- why: chapters/04-hooks.md > "Three to install today"

### HK-13: Always-run lint/format instructions are backed by PostToolUse hooks
- severity: caution
- missing-is: n/a
- check: Grep the target's CLAUDE.md for instructions of the form "always lint",
  "always format", "run X after every edit". For each, grep settings hooks
  blocks for a `PostToolUse` hook that runs it. Flag instruction-only variants;
  skip (n/a) when CLAUDE.md carries no such instruction.
- source-line: "Linting after edits, blocking destructive git commands, loading
  environment on directory change — all hooks."
- why: chapters/04-hooks.md > "The 100% rule" (pattern callout)

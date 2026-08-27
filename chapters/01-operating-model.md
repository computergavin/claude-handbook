---
title: The operating model
status: draft
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/en/how-claude-code-works
  - https://code.claude.com/docs/en/permissions
  - https://code.claude.com/docs/en/permission-modes
  - https://code.claude.com/docs/en/sandboxing
  - https://code.claude.com/docs/en/checkpointing
  - https://code.claude.com/docs/en/headless
  - https://code.claude.com/docs/en/model-config
  - https://code.claude.com/docs/en/output-styles
---

Everything else in this handbook is downstream of one idea: **context is a budget,
not a container.**

The instinct is to treat the context window as a room you keep putting things in
until it's full. The useful model is closer to a bank account. Every file read,
every stack trace, every abandoned approach is a withdrawal, and the balance buys
attention. A session that has burned its budget on exploration has less left for
the work, even though nothing has technically overflowed.

That reframing explains most of the advanced features. Subagents exist to spend
someone else's budget. Hooks exist so rules don't have to be paid for repeatedly in
tokens. Compaction is what happens when the account is overdrawn, and it costs you
detail you chose badly.

## What a harness is

Claude Code is not the model. It is a harness — the docs' own term is "agentic
harness" — made of four things: a system prompt, a set of tools, a permission gate
in front of those tools, and a loop. The loop is gather context → take action →
verify results, repeated until the task is done, with every tool result fed back
in as new input.

This is why the same model behaves differently in Claude Code, in claude.ai, and
in your own API scripts. The weights are identical; the system prompt, tools, and
gating differ, and those three are most of observable behavior. When Claude Code
"decides" to run the tests before answering, that is the harness's system prompt
shaping the loop, not a property of the model. When behavior is wrong, ask which
layer produced it — a model problem, a prompt problem, and a gate problem have
three different fixes.

## The four layers

| Layer | Mechanism | Guarantee |
|---|---|---|
| Instructions | `CLAUDE.md`, rules files | Advisory — followed most of the time |
| Skills | invokable procedures | Advisory, loaded on demand |
| Subagents | isolated context windows | Isolation, not enforcement |
| Hooks | lifecycle shell commands | Deterministic — always runs |

The single most common mistake is putting a requirement in the wrong layer. A
coding preference belongs in instructions. "Never force-push to main" belongs in a
hook, because instructions are a request and hooks are a control.

> [!PATTERN] The layer test
> Ask: what happens the one time the model doesn't follow this? If the answer is
> "nothing much," it's an instruction. If the answer is "I lose work," it's a hook.

Permission rules sit in the enforcement tier with hooks: enforced by Claude Code,
not the model. `CLAUDE.md` shapes what Claude tries; rules change what the harness
allows.

## The permission gate

Every tool call passes through a gate before it runs. The gate has two parts: a
mode setting the session's baseline, and allow/ask/deny rules in `settings.json`
overriding it per tool or command pattern.

The modes, cycled with `Shift+Tab`:

- `default` — labeled Manual. Prompts before most actions.
- `acceptEdits` — file edits and common filesystem commands run unprompted.
- `plan` — file edits are blocked until you approve the plan. Reads run free,
  and other shell commands still prompt unless auto mode's classifier is
  covering the session.
- `auto` — a classifier model reviews actions instead of you. The built-in
  starting mode on Pro, Max, and Team.
- `dontAsk` — auto-denies anything not pre-approved.
- `bypassPermissions` — skips the gate entirely.

Rules evaluate deny, then ask, then allow — first match wins, and specificity does
not change the order, so a deny like `Bash(git push *)` beats any narrower allow.
Two mechanics defeat naive rules: each subcommand of a compound command is matched
independently (`Bash(safe-cmd *)` does not cover `safe-cmd && other-cmd`), and
wrappers like `timeout` and `nohup` are stripped before matching. The space in
`Bash(git diff *)` is load-bearing — without it the rule also matches
`git diff-index`.

> [!PATTERN] Permissions as policy, not clicks
> Every "Yes, and don't ask again" click writes a rule into
> `.claude/settings.local.json`. Skip the intermediary: write your allow/deny lists
> into `.claude/settings.json` and commit them. Your permission posture becomes
> reviewable in a diff, identical across sessions, and portable into headless runs.
> Per-session clicking is the same policy, unaudited.

Sandboxed Bash is the OS-level backstop. On macOS (Seatbelt) and Linux/WSL2, it
confines every Bash command and its child processes to declared filesystem and
network boundaries. That enforcement holds even for a Python script that opens
files itself, which path-based deny rules cannot see. Enable it with `/sandbox` or
`sandbox.enabled: true`. Rules gate what Claude may attempt; the sandbox gates what
a command can reach once running. Use both.

## Plan mode is a cheap dry-run

Plan mode tells Claude to research and propose without editing. It reads files
and runs shell commands to explore, but file edits stay blocked until you
approve the plan. Plan mode is an edit block, not a read-only sandbox: shell
commands that write still prompt for approval during planning. Under auto
mode, the classifier reviews those commands for you.
`Ctrl+G` opens the plan in your editor before approval — the cheapest possible code
review, because you are editing intent before any tokens are spent executing it.

Demand plan mode whenever the blast radius exceeds one file: migrations, refactors
touching call sites you haven't enumerated, anything involving deletion. Enter it
with `Shift+Tab`, prefix one prompt with `/plan`, or start with
`claude --permission-mode plan`. For a repo where every session should start
cautious, set `"permissions": {"defaultMode": "plan"}` in `.claude/settings.json`.

## Checkpoints are the undo layer

Every prompt you send creates a checkpoint of the files Claude edits. Claude
Code keeps the 100 most recent per session. `/rewind` (or `Esc` `Esc` on an empty prompt) restores
code, conversation, or both, independently. Restoring code alone is the underrated
combination: throw away a bad implementation while keeping everything the session
learned about the problem.

> [!WARNING] Rewind does not cover Bash
> Checkpoints track Claude's file-editing tools only. `rm`, `mv`, a script that
> rewrites files, most subagent edits, and anything touching remote systems —
> databases, APIs, deployments — cannot be rewound. The undo layer covers the
> common case, not the catastrophic one; git and hooks cover the rest, which is
> why "never force-push" is a hook and not a hope.

Checkpoints survive `/resume`, are deleted with the session after 30 days, and are
not version control.

## Effort is a dial, not a constant

`/effort` sets how much reasoning the model spends per step: `low`, `medium`,
`high`, `xhigh`, `max`, with `high` the default on every effort-capable model
except Opus 4.7 (`xhigh`). The scale is calibrated per model — the same name is not
the same spend across models. Two lesser-known controls: the literal keyword
`ultrathink` anywhere in a prompt requests deeper reasoning for that turn only
(phrases like "think hard" pass through as ordinary text and do nothing), and an
`effort` field in a skill's or subagent's front matter overrides the session level
while it runs. Route grunt-work subagents to `low`; keep `max` for the turn that
needs it.

## Sessions have a lifecycle

Every session is a JSONL transcript under `~/.claude/projects/`. `claude --continue`
reopens the most recent one, and `claude --resume <id>` reopens a specific one.
`--fork-session` or `/branch` copies history into a new ID, so you can try a
second approach without contaminating the first. That is anchoring insurance,
priced at one flag.

Headless mode, `claude -p "prompt"`, runs the same harness non-interactively and
exits — the building block for agents that run without you. It composes like any
Unix tool: stdin in (capped at 10MB), stdout out, exit code 0 on success.

```bash
session_id=$(claude -p "Review this codebase for performance issues" \
  --output-format json | jq -r '.session_id')
claude -p "Now focus on the database queries" --resume "$session_id"
```

The JSON output also carries `total_cost_usd`, so a cron job can log its own spend.
Wrap `claude -p` in crontab or CI and you have a scheduled agent — nightly triage,
a typo linter on `git diff main` — with permissions supplied by `--allowedTools`
and the committed settings file instead of a human at a prompt.

> [!WARNING] `-p` skips the trust dialog
> A `claude -p` run never shows the workspace trust prompt, yet still executes the
> project's hooks and connects its `.mcp.json` servers. In a repo you didn't write,
> that is arbitrary code execution on your machine. Pass `--bare` — it skips hooks,
> skills, plugins, MCP, and `CLAUDE.md` discovery entirely, is the docs'
> recommended mode for scripts, and starts faster.

## Output styles are not CLAUDE.md

Both are "standing instructions," but they land in different places. An output
style modifies the system prompt itself — role, tone, format — and by default drops
Claude Code's built-in software-engineering instructions unless you set
`keep-coding-instructions: true`. `CLAUDE.md` is injected as a user message after
the system prompt and is for project knowledge: conventions, architecture,
commands. Voice goes in a style; facts go in `CLAUDE.md`. Styles take effect only
after `/clear` or a new session, because the system prompt is read once at startup.

## Three failure modes worth naming

**Context pollution.** Failed approaches don't leave the window when they stop being
relevant. Twenty minutes into a bad debugging path, the session is reasoning against
a transcript full of things that didn't work, and it will keep proposing neighbors
of those things. The fix is isolation — a fresh subagent, or `/clear` and a written
handoff — not a better prompt.

**Anchoring.** The first hypothesis explored biases everything after it. Sequential
investigation is structurally prone to this, which is why parallel adversarial
investigation is the strongest debugging technique in the handbook (see the agent
teams chapter).

**Silent staleness.** Instructions loaded at session start drift out of relevance as
the work moves, and compaction can quietly drop them. Re-injection on compaction
fixes this and almost nobody sets it up (see the hooks chapter for the
`SessionStart` recipe).

## The default posture

Plan in the main session. Explore in subagents. Enforce in hooks. Reserve the main
context for decisions and their reasoning, and push anything that produces volume —
test output, codebase searches, log analysis — somewhere it can be summarized before
it comes back.

> [!CAUTION] Cost is real
> Every layer of delegation multiplies token spend. Isolation is worth paying for
> when the alternative is a polluted main window; it is not worth paying for on a
> task that fits comfortably in one session.

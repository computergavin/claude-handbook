---
title: Agent teams
status: draft
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/en/agent-teams
  - https://arxiv.org/abs/2503.13657
---

Agent teams coordinate multiple full Claude Code sessions. One acts as lead,
assigning work and synthesizing results; teammates each work in their own context
window and message each other directly.

Experimental and off by default. Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
in `settings.json` or the environment. Without it, no team is set up, no team
directories are written, and Claude won't propose teammates. Spawning teammates also
requires an interactive session — under `-p` or the Agent SDK, no team forms.

## The lifecycle

A team is four parts: a **lead** (your main session, which spawns teammates and
coordinates), **teammates** (separate full Claude Code instances), a **shared task
list**, and a **mailbox** per agent for direct messages.

Everything lives on disk under a session-derived name — `session-` plus the first
eight characters of the session ID:

- Team config: `~/.claude/teams/{team-name}/config.json` — runtime state, deleted
  when the session ends. Don't hand-edit it; state updates overwrite your changes.
- Mailboxes: `~/.claude/teams/{team-name}/inboxes/{agent-name}.json`
- Task list: `~/.claude/tasks/{team-name}/` — persists across resume, swept by the
  same `cleanupPeriodDays` as transcripts.

Tasks have three states: pending, in progress, and completed. Tasks can also
declare dependencies, and a pending task with unresolved dependencies can't be
claimed until they complete.
Claiming uses file locking, so two teammates racing for the same task is handled;
two teammates editing the same file is not. The lead assigns tasks, or teammates
self-claim the next unblocked one when they finish.

Messages are delivered automatically — the lead never polls. When a teammate goes
idle it notifies the lead, but the notification carries no output: results only
travel by message or task-list update. Write that into your prompts, or the lead
synthesizes from nothing.

Teammates load project context such as `CLAUDE.md`, MCP servers, and skills,
but they do not inherit the lead's conversation history. Anything the lead worked out has to be
written into the assignment.

## Teams versus subagents

A subagent is a function call. A team is an organization. The difference that matters
in practice is communication. Subagents are fire-and-forget workers that report
upward and never talk to each other. Teammates are long-lived peers that
negotiate directly and claim work from a shared list, and you can message any
of them without going through the lead. That makes teams worth the overhead
only when the work has genuine interfaces to agree on.

| Use a subagent | Use a team |
|---|---|
| One isolated task, one answer | Multiple workstreams with interfaces between them |
| Verification, search, test runs | Multi-layer features, large refactors |
| Cost matters | Speed matters more than cost |

> [!CAUTION] Enabling teams changes ordinary delegation
> While the flag is on, any subagent Claude *names* launches as a teammate — even
> during delegation you never framed as team work. Teammates report back differently
> from subagents: the idle notification arrives without the output, so an
> orchestration flow waiting on subagent results can stall. Set the variable to `0`
> in user `settings.json` to restore normal subagents; it takes effect on the next
> spawn, no restart needed.

## The technique that justifies the feature

The strongest use is not parallel implementation. It's parallel *disagreement*.

Spawn several teammates on competing hypotheses and have them actively try to
disprove each other, like a scientific debate. Sequential investigation suffers from
anchoring: once one theory has been explored, everything after it is biased toward
that theory. With independent investigators attacking each other's explanations, the
one that survives is much more likely to be the real cause.

> [!PATTERN] Adversarial debugging
> "Users report the app exits after one message. Spawn five teammates to investigate
> different hypotheses. Have them talk to each other and try to disprove each other's
> theories. Update the findings doc with whatever consensus emerges."
>
> Reach for this on the bug that has already eaten a day. The cost is high and the
> anchoring cure is worth it precisely when your own reasoning has been stuck in one
> groove for hours.

## Running one

Name the teammates and their scopes explicitly. "Spawn three agents for this
codebase review" produces three agents doing overlapping work; naming them —
security, performance, tests — produces three agents doing different work. Named
teammates are also addressable: any teammate can message any other by name, and so
can you.

Other things that matter:

- Give each teammate an exclusive file scope. Two teammates editing the same file is
  the main source of team failures.
- State dependencies as instructions: who waits for whom, who confirms before the
  next starts.
- Require the lead to wait for all completions before synthesizing.
- Start with 3–5 teammates and 5–6 tasks each. Three focused teammates outperform
  five scattered ones, and small task grain lets the lead reassign when someone
  stalls.
- Reuse subagent definitions as roles: "spawn a teammate using the
  `security-reviewer` agent type." The teammate honors that definition's `tools`
  allowlist and model; its body is appended to the system prompt. The `skills` and
  `mcpServers` frontmatter fields are ignored for teammates.
- For risky work, require plan approval: the teammate stays read-only until the lead
  approves its plan. The lead judges autonomously, so give it criteria — "only
  approve plans that include test coverage."

If the lead starts writing code instead of coordinating, there's no dedicated
coordination-only mode to switch it into — redirect it in plain language: "wait
for your teammates to complete their tasks before proceeding."

Display is `teammateMode` in `settings.json`, or `--teammate-mode` per
session. The default, `"in-process"`, keeps everyone in one terminal behind an
agent panel: arrows to select, Enter to view and message, `x` to stop, Ctrl+T
for the task list. `"tmux"` gives each teammate its own split pane via tmux or
iTerm2's `it2` CLI. In-process works everywhere; split panes don't work in VS Code's terminal,
Windows Terminal, or Ghostty.

## Quality gates

Instructions to "check your work" are advisory. Two mechanisms are not:

**Hooks on team events.** Three events exist for exactly this (see the Hooks
chapter for mechanics):

- `TeammateIdle` fires before a teammate goes idle. Exit 2 sends feedback and
  keeps it working.
- `TaskCreated` can block a malformed task at creation.
- `TaskCompleted` can refuse the completion.

A `TaskCompleted` hook that
runs the test suite and exits 2 on failure means no teammate can mark work done
that doesn't build.

**A verifier teammate.** Add one teammate whose only job is to challenge the
others' completed work — rerun the repro, read the diff, message the author with
what's wrong. It writes no code, so it conflicts with no one.

## Why multi-agent systems fail

The MAST taxonomy ("Why Do Multi-Agent LLM Systems Fail?", arXiv 2503.13657v3)
analyzed 1,642 execution traces across seven open-source multi-agent frameworks and
found failure rates from 41% to 86.7%. The taxonomy itself was built from an
initial 150 traces across five of those frameworks, coded by six human experts,
with the resulting scheme checked for inter-annotator agreement at κ = 0.88. It
derives 14 failure modes in three categories. **System design issues** cause
~44% of failures: disobeyed task or role specifications, step repetition,
unawareness of stopping conditions. **Inter-agent misalignment** causes ~32%:
task derailment, information withholding, ignoring other agents' input,
failing to ask for clarification. **Task verification** causes ~24%: premature
termination, missing or incorrect verification.

The headline: "many MAS failures arise from the challenges in organizational design
and agent coordination rather than the limitations of individual agents." Same
models, better structure, better results. Adding a task-verification stage to
ChatDev improved task success by 15.6 points on the ProgramDev benchmark. Design the org chart, not just the prompts.

The taxonomy maps directly onto team practice:

- **Specification and design failures → task-list contracts.** Every task states
  its deliverable, file scope, and stopping condition. "Refactor auth" derails;
  "make `src/auth/` pass the existing suite with sessions moved to httpOnly
  cookies, then mark the task complete" doesn't.
- **Inter-agent misalignment → messaging discipline.** Require teammates to message
  findings, not just finish; require the lead to wait for those messages before
  synthesizing. Idle notifications carry no content — silence is not agreement.
- **Verification failures → a verifier that isn't the author.** MAST's third
  category covers "no or incomplete verification" and "incorrect
  verification", which together account for roughly a sixth of all failures.
  The verifier teammate and the `TaskCompleted` hook above are the structural
  fix.

> [!NOTE] The failure is usually yours, not the model's
> When a team run goes sideways, reread your spawn prompt before blaming the
> model. Most multi-agent failures are specification and coordination failures —
> the fix is a tighter task contract, not a bigger model.

## Cost

> [!CAUTION] Tokens scale linearly with team size
> Each teammate is a separate Claude instance with its own context window, so
> cost scales linearly as you add teammates — Anthropic's docs confirm the
> scaling but publish no multiplier. Budget roughly 5× a single session's tokens
> for five teammates as a working estimate, not a documented figure. Reserve
> teams for work that genuinely benefits from multiple perspectives running at
> once. For anything else, subagents or a single session are the right call. One
> way to claw cost back: in-process teammates fall outside the main
> conversation's prompt-cache TTL bucket, so their cache holds five minutes by
> default. Set `subagentPromptCacheTtl` to `1h` for long runs (the API bills
> 1-hour cache writes at a higher rate).

> [!CAUTION] Experimental means experimental
> Known rough edges: `/resume` and `/rewind` do not restore in-process teammates —
> the lead messages ghosts until told to respawn; task status can lag, blocking
> dependents; shutdown waits for the current tool call; one team per session, no
> nested teams, and the lead is fixed for the session's lifetime. Start on
> read-only work — a multi-angle code review — before letting a team write to a
> repository you care about.

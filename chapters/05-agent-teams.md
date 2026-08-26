---
title: Agent teams
status: experimental
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/en/agent-teams
---

Agent teams coordinate multiple full Claude Code sessions. One acts as lead,
assigning work and synthesising results; teammates each work in their own context
window and message each other directly.

Experimental and off by default. Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
in `settings.json` or the environment. Without it, no team is set up, no team
directories are written, and Claude won't propose teammates.

Teammates load project context automatically — `CLAUDE.md`, MCP servers, skills — but
they do not inherit the lead's conversation history. Anything the lead worked out has
to be written into the assignment.

## Teams versus subagents

A subagent is a function call. A team is an organisation. The difference that matters
in practice is communication: subagents report upward and never talk to each other,
while teammates negotiate directly. That makes teams worth the overhead only when the
work has genuine interfaces to agree on.

| Use a subagent | Use a team |
|---|---|
| One isolated task, one answer | Multiple workstreams with interfaces between them |
| Verification, search, test runs | Multi-layer features, large refactors |
| Cost matters | Speed matters more than cost |

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
security, performance, tests — produces three agents doing different work.

Other things that matter:

- Give each teammate an exclusive file scope. Two teammates editing the same file is
  the main source of team failures.
- State dependencies as instructions: who waits for whom, who confirms before the
  next starts.
- Require the lead to wait for all completions before synthesising.
- Have the lead delete the team before the final response.

If the lead starts writing code instead of coordinating, `Shift+Tab` restricts it to
coordination-only tools — spawning, messaging, task management, shutdown.

> [!CAUTION] Roughly 5× tokens per teammate
> Reserve teams for work that genuinely benefits from multiple perspectives running
> at once. For anything else, subagents or a single session are the right call.

> [!WARNING] Experimental means experimental
> Known rough edges around session resumption, task coordination, and shutdown
> behaviour. Start on read-only work — a multi-angle code review — before letting a
> team write to a repository you care about.

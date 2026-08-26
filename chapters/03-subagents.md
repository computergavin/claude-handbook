---
title: Subagents
status: stable
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/en/sub-agents
---

A subagent is a task delegated to a separate Claude Code session with its own
context window, its own system prompt, and optionally its own tool allowlist and
model. It reports back a summary. Everything it read to produce that summary stays
behind.

The common framing is parallelism. The real value is **isolation**: a subagent
starts clean, so it is not influenced by whatever the main session has already tried
and failed at.

## When to delegate

Delegate when the task will generate volume you don't want to keep:

- Running a test suite — the failures come back, the 4,000 lines of output don't.
- Searching an unfamiliar codebase to answer one question.
- Reading logs, diffing large files, auditing dependencies.
- Any verification pass that should not be biased by the reasoning that produced the
  thing being verified.

Don't delegate work that is short, sequential, or needs the conversation's history
to make sense. Handing a subagent a task that depends on context it doesn't have
produces confident, wrong output.

## Definition

Subagents live in `.claude/agents/*.md` as markdown with front matter.

```markdown
---
name: verifier
description: Independently verifies an implementation against its stated
  requirements. Use after any non-trivial change.
tools: Read, Glob, Grep, Bash
model: sonnet
---

You verify. You do not fix.

Read the requirement, read the implementation, and report only:
1. Requirements demonstrably met, with the evidence.
2. Requirements not met or unverifiable.
3. Behaviour present in the code that no requirement asked for.

Never edit a file. Never suggest an approach. Report and stop.
```

Fields worth knowing beyond the obvious:

- `tools` — a comma-separated allowlist. Omitted means it inherits everything. Also
  accepts `Agent(agent_type)` to restrict which subagents it may itself spawn.
- `model` — `sonnet`, `opus`, `haiku`, a full model ID, or `inherit` (the default).
- `skills` — skills preloaded into the agent's context at startup, with their full
  content injected rather than merely made available.
- `hooks` — lifecycle hooks scoped to only this subagent while it runs.

> [!PATTERN] Builder / verifier split
> The verifier's power comes entirely from not having watched the code get written.
> If it inherits the builder's reasoning it will inherit the builder's blind spots.
> Give it read-only tools so it physically cannot "just fix it" and collapse the two
> roles back together.

## Model tiering

Route grunt work — file search, log scanning, API polling — to a cheaper model and
keep the expensive one for architectural reasoning. This is the single easiest cost
reduction available, and it usually improves output too, because the expensive model
stops spending attention on retrieval.

> [!CAUTION] Summarisation is lossy on purpose
> A subagent returns a summary, and the summary is written by a model that decided
> what mattered. For anything where a specific detail matters, say so explicitly in
> the delegation: "return the exact error strings, not a description of them."

## Prompting a delegation

The three things a subagent needs that the main session forgets to give it:

1. **The goal, not the step.** "Find why the build fails on CI but not locally," not
   "read the CI config."
2. **The return contract.** What exactly should come back, and in what shape.
3. **The boundary.** What it must not touch, so its lack of context can't hurt you.

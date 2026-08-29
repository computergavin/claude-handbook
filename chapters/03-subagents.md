---
title: Subagents
status: draft
verified: 2026-08-28
sources:
  - https://code.claude.com/docs/en/sub-agents
  - https://www.anthropic.com/engineering/multi-agent-research-system
---

A subagent is a separate Claude Code session you delegate a task to, with its
own context window, its own system prompt, and optionally its own tool
allowlist and model. It reports back a summary. Everything it read to produce that summary stays
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
produces confident, wrong output. A single-fact lookup is the degenerate case:
spawning an agent to answer something one `Grep` call answers pays a whole session
of startup context for nothing. Anthropic's scaling rule for its research system:
simple fact-finding gets one agent with 3–10 tool calls; only genuinely complex
research justifies ten or more subagents — and most coding tasks have fewer truly
parallelizable pieces than research does. Domains where every agent needs the same
shared context, or where steps depend tightly on each other, are a poor fit.

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
3. Behavior present in the code that no requirement asked for.

Never edit a file. Never suggest an approach. Report and stop.
```

Fields worth knowing beyond the obvious:

- `tools` — a comma-separated allowlist. Omitted means it inherits everything.
  `disallowedTools` is the complementary denylist. Listing `Agent` lets the subagent
  spawn subagents of its own while the depth limit allows it — but the
  `Agent(agent_type)` syntax that restricts *which* types can be spawned only applies
  to an agent running as the main thread via `claude --agent`. Inside a subagent's
  own `tools` field, any type list in the parentheses is ignored. In an interactive
  session this is usually moot: background is the default there, and the background
  tool set has no `Agent` in it, so the subagent can't delegate whatever you list.
- `model` — `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit` (the
  default). `CLAUDE_CODE_SUBAGENT_MODEL` overrides it, and a per-invocation model
  overrides the field too, so a definition's `model` is the weakest of the three.
- `effort` — `low`, `medium`, `high`, `xhigh`, or `max`. Effort is a knob separate
  from model choice: a Sonnet agent at `low` effort is the cheapest worker you can
  field.
- `maxTurns` — hard cap on agentic turns before the agent stops. Set it on anything
  that could loop. Hitting it marks the output partial and returns an agent ID, so
  the work can be resumed rather than restarted.
- `skills` — skills preloaded into the agent's context at startup, with their full
  content injected rather than merely made available.
- `hooks` — lifecycle hooks scoped to only this subagent while it runs. Plugin-loaded
  subagents ignore this field, along with `mcpServers` and `permissionMode` — silently,
  so a plugin agent you thought was fenced isn't.
- `permissionMode` — `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`,
  `plan`, or `manual`, set per agent rather than per session.
- `mcpServers` — server names, or inline definitions. The narrow way to give one agent
  a server without attaching it to everything.
- `isolation: worktree` — runs the agent in its own git worktree on a temporary branch.
  This is the fan-out pattern below, made structural instead of instructed.
- `memory` — `user`, `project`, or `local`. Gives the agent a persistent directory;
  the first 200 lines / 25KB of its `MEMORY.md` are injected into its system prompt
  each run. A reviewer agent that remembers past false positives is a different
  tool than one that starts amnesiac.
- `background: true` — keeps the agent in the background even when Claude wants it
  foreground.
- `color`, `initialPrompt`, `experimental` — display color in the task list; a first
  turn auto-submitted when the agent runs as the main session; and a map whose
  `cacheTtl` (`5m` or `1h`) is worth setting on an agent you resume repeatedly.

Definitions resolve by precedence: managed settings, then the `--agents` CLI flag,
then `.claude/agents/` (project, commit it), then `~/.claude/agents/` (personal,
every project), then plugin agents. Same name, higher location wins. Both agent
directories are scanned recursively, and edits are picked up within seconds. Three
cases still need a restart: the first agent in a brand-new `agents/` directory, any
agent under a path added with `--add-dir` (those are never watched), and any session
started with `--disable-slash-commands`.

Delegation is not the only way in. `@agent-<name>` guarantees a specific subagent
runs rather than leaving the choice to Claude; `claude --agent <name>` or the `agent`
setting gives a whole session that agent's prompt, tools, and model; and
`--agents '<json>'` defines one inline for a single session, which is how you test a
definition before committing it.

> [!PATTERN] Builder / verifier split
> The verifier's power comes entirely from not having watched the code get written.
> If it inherits the builder's reasoning it will inherit the builder's blind spots.
> Give it read-only tools so it physically cannot "just fix it" and collapse the two
> roles back together.

## What the subagent actually sees

Context isolation is precise, and knowing the exact boundary changes how you write
delegations. A subagent starts with its own system prompt, the delegation message
Claude writes, the full CLAUDE.md hierarchy, and a git-status snapshot from parent
session start, and a roster of the other named agents in the session. It does not get
the conversation history, the main session's auto memory, your output style, or
anything the main session has read — including skills invoked earlier in the session,
which it has to rediscover. The built-in Explore and Plan agents skip even CLAUDE.md
and git status — they are cheaper to start but blinder.

The economics follow from that boundary. Anthropic's multi-agent research post
reports that agents use about 4× the tokens of a chat interaction, and multi-agent
systems about 15× — you are buying fresh context windows, and they are not free.
What you get for it: their multi-agent system (Opus 4 lead, Sonnet 4 subagents)
outperformed single-agent Opus 4 by 90.2% on their internal research eval, and on
the BrowseComp eval, token spend alone explained 80% of performance variance.
Spending more tokens across more context windows is, mechanically, how multi-agent
buys capability — so the task's value has to be high enough to pay for it.

## Model tiering

Route grunt work — file search, log scanning, API polling — to a cheaper model and
keep the expensive one for architectural reasoning. This is the single easiest cost
reduction available. The concrete mechanism at project scale is a fleet of parallel Sonnet
builders. On one shipped iOS project, five of them ran repeatedly with zero
collisions.

> [!CAUTION] Summarization is lossy on purpose
> A subagent returns a summary, and the summary is written by a model that decided
> what mattered. For anything where a specific detail matters, say so explicitly in
> the delegation: "return the exact error strings, not a description of them."

## Orchestrator patterns

Three shapes cover almost every multi-agent job:

**Fan-out with disjoint file ownership.** For a batch change that cross-cuts many
files, dispatch N agents that each own a non-overlapping set of files, forbid them
from committing or building, and run exactly one integration build afterward. Where
the agents would collide anyway, `isolation: worktree` gives each its own checkout
and makes the partition a property of the filesystem rather than of your prompt.
Partition by file, never by finding: findings overlap on shared files and produce
write collisions; file ownership guarantees zero collisions by construction. The
integration build exists to catch *your* edits too — in one project's fleet runs, the
one failure it caught was the orchestrator's own pre-wired plumbing, not any
agent's work.

**Pipeline vs barrier.** A pipeline chains stages where each output feeds the next
— search, then synthesize, then verify — and is right when stages genuinely depend.
A barrier fans out, waits for all agents, then does one integration step. Prefer
the barrier whenever you can make the work disjoint: pipelines serialize latency
and compound each stage's summarization loss, while a barrier pays it once.

**Result contracts.** Prose summaries are where delegation value dies. Specify the
return shape in the delegation prompt as if you were designing an API response:

```
Return ONLY a markdown table: file | line | severity (P0/P1/P2) | one-line
finding | exact code snippet. No preamble, no recommendations, no summary
paragraph. If you found nothing, return the literal string NONE.
```

An agent given that contract returns data you can triage, diff against a previous
run, or hand to the next agent. An agent given "review this code" returns an essay.
Anthropic's delegation guidance is the same list: an objective, an output format,
tool guidance, and explicit task boundaries.

> [!PATTERN] Prompt-shape the return, not just the task
> The return contract is half the delegation. Name the fields, name the sort order,
> name the empty-result sentinel, and cap the length ("at most 10 findings"). Every
> constraint you put on the output is context you don't spend re-parsing prose in
> the main session. This composes with Structured output on the API side: the same
> discipline, enforced by schema instead of prompt.

## Background agents

Foreground agents block the conversation; background agents run concurrently and
report back when done. Backgrounding is the default when fork mode is on (delegation to forks that
inherit the main conversation's context), and any agent can opt in permanently
with `background: true`. Two limits to know: 20
concurrent subagents (raise with `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`; sessions
running at ultracode effort are exempt) and a spawn depth of 3
(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), at which point the `Agent` tool is withheld
outright. Background agents also
run with a reduced built-in tool set — file tools, Bash, web tools, and messaging
survive; interactive tools don't — and their permission prompts surface in the main
session, so a background agent that needs approvals will stall silently until you
look. Kick off long verification passes in the background at the *start* of a work
block, not the end, so the results land while you still have budget to act on them.

## Prompting a delegation

The three things a subagent needs that the main session forgets to give it:

1. **The goal, not the step.** "Find why the build fails on CI but not locally," not
   "read the CI config."
2. **The return contract.** What exactly should come back, and in what shape.
3. **The boundary.** What it must not touch, so its lack of context can't hurt you.

## Findings are candidates, not facts

Treat everything a subagent returns as candidate findings requiring verification,
not as ground truth. The agent has less context than you, summarizes aggressively, and, if it is a
reviewer, is prompted to find problems, which biases it toward finding some. The working ritual from one project's first end-of-week review: check
each finding against source before filing it, and explicitly log what you dropped
and why. Two reviewer claims in that pass were checked, found wrong, and dropped;
unverified, they would have driven two pointless fixes. The verification cost is
small because the result contract already gives you file-and-line claims that are
cheap to check — one more reason to demand structured returns.

> [!FIELD] 2026-07-30 — Convergence as free cross-validation
> A pre-launch audit ran five read-only Sonnet agents, each owning one
> orthogonal dimension (copy truthfulness, store paperwork, licensing, dependency
> graph, StoreKit compliance). Two agents independently converged on the same
> unlisted gap — no privacy-policy URL existed. When agents with disjoint briefs
> agree on a finding neither was asked about, that finding has effectively been
> verified twice for free. Promote convergent findings past the candidate stage;
> hold solo findings to the check-against-source rule.

> [!FIELD] 2026-08-29 — Convergence proves nothing about a shared premise
> A landing-page review fanned out four agents over one `BRIEF.md` carrying the
> orchestrator's own measurements. Two of those numbers were wrong: the brief put
> a section at y≈810 when it starts at 908, and a mobile form ending at y≈740 when
> it ends at 609. Three agents built findings on them and none pushed back. The
> fourth, whose claims rested on files on disk, measured the images itself with
> `sips` and rejected a brief premise outright. The variable is not credulity, it
> is whether independent verification was cheap for that agent: the orchestrator
> held the only browser, so re-measuring geometry was expensive and three agents
> took the numbers on trust. Convergence is free cross-validation only when the
> inputs are disjoint, and a shared brief is the most efficient way to correlate
> them. The human caught this, not the fan-out. That is one observation, not a
> frequency claim. The test that settles it: give one agent in the next fan-out no
> shared measurements and make it derive its own. If it reliably collides with the
> others, promote this to body text. If it never does, delete the note.

---
title: Project memory and context engineering
status: draft
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/en/memory
  - https://code.claude.com/docs/en/context-window
  - https://code.claude.com/docs/en/costs
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://platform.claude.com/docs/en/build-with-claude/prompt-caching
---

How Claude Code knows what it knows at session start, and how to spend the
finite context that knowledge competes with.

Two mechanisms carry knowledge across sessions: CLAUDE.md files you write, and
auto memory Claude writes for itself. Both are context, not enforcement — an
instruction that must hold every time belongs in Hooks, not here.

## The hierarchy Claude Code actually reads

Memory files load in a fixed order, broadest scope first, so the file closest
to your work is the last thing Claude reads:

| Order | Scope | Location |
|---|---|---|
| 1 | Managed policy | `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS) |
| 2 | User | `~/.claude/CLAUDE.md` |
| 3 | Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` |
| 4 | Local | `./CLAUDE.local.md`, gitignored |

Files concatenate; nothing overrides. Claude Code walks from your working
directory up to the filesystem root and loads every `CLAUDE.md` and
`CLAUDE.local.md` it finds at launch. Files in subdirectories *below* you load
lazily, when Claude reads files there. In a monorepo where another team's
ancestor file pollutes your context, `claudeMdExcludes` in settings skips it
by glob — managed policy files excepted.

Imports use `@path/to/file` anywhere in the body, resolve relative to the file
containing them, and nest four hops deep. Wrap a path in backticks —
`` `@README` `` — to mention it without importing it. A project-level import
that resolves outside the working directory triggers a one-time approval
dialog; your own user-scope imports load without one.

> [!CAUTION] Imports organise, they don't economise
> Imported files are expanded into context at launch alongside the CLAUDE.md
> that references them. Splitting a 400-line file into imports costs exactly
> the same tokens. Only path-scoped rules and skills actually defer loading.

Keep each file under roughly 200 lines — the documented target, and past it
adherence drops. Claude Code loads a CLAUDE.md up to 4 MiB and
silently skips anything larger. Run `/init` to generate a starting point in a
new repo, `/context` to confirm what actually loaded, and `/doctor` to propose
trims — it cuts what Claude can derive from the codebase and keeps pitfalls,
rationale, and conventions that differ from tool defaults.

> [!NOTE] HTML comments are free
> Block-level `<!-- comments -->` in CLAUDE.md are stripped before injection.
> Leave maintainer notes, changelog stamps, and "why this rule exists"
> annotations in comments at zero token cost.

## Rules files

`.claude/rules/*.md` load into context, and the `InstructionsLoaded` hook fires
when they do — at session start and on lazy load during a session. Rules
without `paths:` frontmatter load at launch with the same priority as
`.claude/CLAUDE.md`; rules with it load only when Claude reads a matching file,
which is the mechanism that actually keeps startup context lean. User-level
rules in `~/.claude/rules/` load before project rules, so project rules win.

## Skills

Skills package a repeatable procedure as `.claude/skills/<name>/SKILL.md` — a
directory, not a loose markdown file. The former custom-commands system was
merged into skills. The dividing line against CLAUDE.md: rules are facts
Claude should hold in every session; skills are procedures that load on
invocation. Anything multi-step moves to a skill; the tokens it would have
cost every session are the argument.

## Auto memory

Claude writes its own notes to `~/.claude/projects/<project>/memory/` — a
`MEMORY.md` index plus one topic file per memory. The first 200 lines or 25KB
of the index, whichever comes first, load into every session; everything past
that threshold silently doesn't. Topic files never load at startup — Claude
reads them on demand. The directory is keyed to the git repo, so all worktrees
share one memory, and it is exempt from the transcript retention sweep.

Claude files four kinds of notes — `user`, `feedback`, `project`, `reference`
— and skips anything derivable from the codebase or already stated in
CLAUDE.md. It is machine-local plain markdown: run `/memory` to audit it, and
delete entries that have gone stale, because a wrong memory is loaded with the
same authority as a right one.

## What belongs in memory versus the repo

> [!PATTERN] CLAUDE.md is a cache of judgment
> Every entry should be a decision you paid for once — in debugging time,
> review comments, or a correction you typed twice — now referenced for the
> price of its line count. If a command can answer it (`git log`, `ls`,
> `package.json`), it is not memory, it is derivable state, and caching it
> creates a staleness liability. Write down *why*, not *what is*.

The documented triggers for adding an entry match field experience: Claude
makes the same mistake a second time, or you type the same correction you
typed last session. The inverse rule matters more. Directory layouts,
dependency lists, and architecture overviews rot the moment the repo moves;
that is exactly the content `/doctor` proposes cutting.

## Compaction

Compaction summarises the conversation to free space. What survives is
mechanical, not lucky:

- The system prompt is untouched. Project-root CLAUDE.md, unscoped rules, auto
  memory, and any plan-mode plan are re-injected from disk.
- Up to five of the files Claude read or edited come back, most recently
  modified first. A file over 5,000 tokens returns as a path reference, not
  content.
- Path-scoped rules and nested CLAUDE.md files reload only as Claude re-reads
  matching files. A rule that must survive compaction drops its `paths:`
  frontmatter or moves to the project root.
- Invoked skill bodies are re-injected: each is truncated to 5,000 tokens,
  keeping the start of the file and cutting the end, and once invoked skills
  together exceed 25,000 tokens the oldest-invoked ones are dropped whole —
  put a skill's critical instructions at the top of `SKILL.md`.
- Anything given only in conversation is summarised with everything else.

A `## Compact Instructions` section in `CLAUDE.md` tells the summariser what
to preserve, and `/compact focus on the auth bug` does it per-run. Worth
pairing with the `SessionStart`/`compact` re-injection hook — see Hooks for
the config. `/autocompact 500k` moves the automatic threshold earlier, and
`/rewind` → "Summarize from here" compacts part of a conversation instead of
all of it.

> [!CAUTION] Compaction is itself a large request
> `/compact` reads the entire conversation it summarises, so compacting a
> full context is one of the most expensive single requests you can make.
> `/clear` costs nothing. When the next task doesn't need the history, clear;
> compact only when continuity is worth paying for. `/rename` before
> clearing so `/resume` can find the session later.

## Handoff docs

A handoff doc records what only the session knew — intent, blockers,
decisions, "resume by" — and never caches what a command can answer. Git
state is the canonical violation: a prose snapshot of push status goes stale
the instant anything pushes from another terminal, and a stale claim actively
misleads where an absent one would just prompt a lookup. Re-derive git facts
live at resume, `git fetch` before `git status`.

## Context budgets for long-horizon work

The operating model's framing — context is a budget, not a container — has a
mechanical basis. Anthropic's context-engineering guidance names it context
rot: recall accuracy degrades as token count grows, because transformer
attention spreads n² pairwise relationships over an ever-longer window. A
loaded token is not free even before it costs money; it competes for
attention with the tokens doing the work.

The budget also has a price structure. Everything that loads before your first
prompt — system prompt, tool schemas, CLAUDE.md, memory index — is a stable
prefix, and prompt caching makes re-reading it cheap: cache reads bill at 0.1x
the base input rate. Writes cost more to lay down: 1.25x for the standard
5-minute cache, 2x for the extended 1-hour cache. The cache is a prefix
match, so one changed byte invalidates everything after it. Keep the stable
material stable and let only the conversation tail vary. The cache lives an
hour on a subscription and five minutes on an API key or while drawing usage
credits, which is why the first message after a long break reprocesses your
whole context. Cost and latency covers the API-side numbers; Building on the
API covers breakpoint placement.

For work that outlives any single window, the same guidance gives three
levers, all of which this handbook already institutionalises: compaction
(above), structured notes outside the window (auto memory, handoff docs), and
subagents that burn their own context and return a 1,000–2,000-token summary
— see Subagents. Long-horizon capacity is not a bigger window; it is a
discipline about what never enters the window at all.

---
title: Project memory and skills
status: stub
verified: 2026-08-26
---

How Claude Code knows what it knows at session start, and how to shape that.

## CLAUDE.md

Keep it under roughly 200 lines and use imports for anything beyond that. Run
`/init` to generate a starting point in a new repo.

*To capture:* what actually belongs here versus a rule file, what your standard
sections are, and which instructions you've had to repeat often enough that they
should have been hooks instead.

## Rules files

`.claude/rules/*.md` load into context, and the `InstructionsLoaded` hook fires when
they do — at session start and on lazy load during a session.

*To capture:* your glob-scoped rules, and whether path-matched loading actually keeps
context lean in practice.

## Skills

Skills package a repeatable procedure as `skills/<name>/SKILL.md` — a directory, not
a loose markdown file. The former custom-commands system was merged into skills.

*To capture:* which of your workflows became skills, what the description field needs
to say to trigger reliably, and which ones failed to trigger and why.

## Compaction policy

A `## Compact Instructions` section in `CLAUDE.md` tells the summariser what to
preserve. Worth pairing with the `SessionStart`/`compact` re-injection hook.

*To capture:* your standing compact instructions.

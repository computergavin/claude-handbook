---
name: handbook-audit
description: Audit a target repo's Claude-workflow layer against the handbook's
  practices, using distilled per-chapter checklists. Use when the user wants a
  repo's CLAUDE.md, hooks, agents, skills, or permission setup audited, reviewed,
  or graded against the handbook.
---

# Handbook audit

Audit the Claude-workflow layer of a target repo — CLAUDE.md, `.claude/` settings,
skills, hooks, agents, `.mcp.json`, and memory files — against checkable assertions
distilled from the chapters. This is not code review: never judge application code,
and never write into the target repo unless the user asks for a report file.

## Arguments

`/handbook-audit [path] [--chapters NN,NN] [--min-severity warning|caution|note]`

- No path: audit the CWD. Resolve to absolute; confirm it is a directory. Auditing
  this repo itself is the dogfood case, not an error.
- If the target has neither a `CLAUDE.md` nor a `.claude/` directory, stop with a
  two-line report — no Claude workflow layer found, see the project memory
  chapter — instead of emitting a page of vacuous findings.
- `--chapters` filters which checklists load, by number or slug. Warn on unknown
  values and drop them; do not abort.
- `--min-severity` hides findings below the floor from the itemized list; they
  still count in the coverage table. Default `note` (show everything).

## Procedure

1. **Load checklists.** Read `checklists/MANIFEST.md` in this skill's directory,
   then each listed checklist. Recompute each source hash — `shasum -a 256
   <source> | cut -c1-12` from the repo root — and compare against the
   checklist's `source-hash`. Mismatched checklists still run but are marked
   STALE in the coverage table. Apply `--chapters` here.
2. **Recon.** Build a fact table for the target, reading each small config file
   fully: root and nested `CLAUDE.md` (line count, headings, derivable-state
   smells), `.claude/settings.json` and `settings.local.json` (hooks,
   permissions, env), every `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`
   frontmatter, `.claude/hooks/*` scripts, `.mcp.json`, memory files (HANDOFF,
   TODO, DECISIONS or equivalents) with last-commit dates, `.gitignore`
   treatment of local settings and secrets, and read-only git facts (tracked
   `.claude/`, remotes). The whole layer is a few KB; load it once and the
   checks are nearly free.
3. **Gate.** Set the target's gates from the fact table: `always` ·
   `hooks` (hooks configured or scripts present) · `agents` (`.claude/agents/`
   non-empty) · `mcp` (`.mcp.json` or MCP permission rules) · `skills`
   (`.claude/skills/` non-empty) · `headless` (scripts or CI invoking
   `claude -p`) · `handoff` (HANDOFF.md or equivalent) · `prompts` (checked-in
   prompt files) · `teams` (agent-teams env flag) · `sandbox` (sandbox enabled
   in any settings file). A checklist whose `gate`
   fails is SKIPPED with the reason in the coverage table; an assertion whose
   `applies:` fails is skipped silently. `missing-is:` decides whether an
   absent artifact is a finding, a note, or n/a — never force-run an
   inapplicable check to manufacture findings.
4. **Check.** Run the surviving assertions in chapter order, inline — the
   evidence is already in context. Execute each `check:` mechanically (grep,
   stat, compare); before tagging any failure FIX-REPO, grep the target's
   memory files for the topic — a documented reason changes the disposition.
   For every `warning` finding, open the cited chapter section and quote one
   sentence of rationale; `caution` and `note` findings cite without loading
   prose.

## Finding format

```
[WARNING] HK-02 — pre-push hook blocks without printing a reason
  evidence: .claude/hooks/guard.sh:14 (exit 2, no stderr message)
  cites: the hooks chapter, "Enforcement, not suggestion"
  disposition: FIX-REPO
  fix: echo the reason to stderr before exit 2
```

`disposition` is one of:

- `FIX-REPO` — the repo violates the assertion with no documented reason.
- `JUSTIFIED-DEVIATION` — the repo violates it and a memory file, settings
  comment, or CLAUDE.md rule says why. Quote the justification.
- `HANDBOOK-BUG?` — the deviation demonstrably works, or the assertion
  contradicts current Claude Code behavior, and nothing documents it as a
  workaround. End these with: "If confirmed, run /capture-lesson in the
  handbook repo against chapter NN."

## Report

1. Verdict line: `sound` (0 warnings, 0 cautions) / `needs work` (0 warnings) /
   `at risk` (any warning), with counts per severity and applicable-chapter
   count.
2. Findings by severity, warnings first, in the block format above.
3. Coverage table: one row per checklist — APPLIED (n pass / n fail), SKIPPED
   (reason), STALE flag. Count only assertions that ran: `applies:`-skipped
   and absent-artifact n/a assertions are excluded from both numbers; a check
   that ran and found nothing to flag counts as a pass, vacuous or not.
4. Deviations and handbook feedback: the JUSTIFIED-DEVIATION and HANDBOOK-BUG?
   items, separated from failures.

Offer, once, to write the report to `<target>/AUDIT.md`. Do not write it
unasked.

Checklists live only under this skill; they are never registered in `book.json`
and never moved under `chapters/`, or the book build will sweep them in. A repo
that fails an assertion is not automatically wrong — a deviation that survives
contact with real work is evidence about the handbook too, which is why
HANDBOOK-BUG? exists.

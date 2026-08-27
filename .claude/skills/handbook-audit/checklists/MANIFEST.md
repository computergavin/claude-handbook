# Checklist manifest

Checklists distill chapters into checkable audit assertions. They live here,
under the skill, and are never registered in `book.json` or moved under
`chapters/` — the book build must not sweep them in.

## Schema

File frontmatter:

```yaml
source: chapters/04-hooks.md      # the chapter this file distills
source-verified: 2026-08-26       # copied from the chapter's verified date
source-hash: a1b2c3d4e5f6         # shasum -a 256 <source> | cut -c1-12
extracted: 2026-08-27             # date this distillation was made
gate: always                      # coarsest gate; see SKILL.md step 3
```

Each assertion is a `### ID: title` block. IDs are chapter-prefixed (OM, PM,
SA, HK, MC, SC), stable across regenerations so findings diff between runs.

```markdown
### HK-03: Stop hooks handle stop_hook_active
- severity: caution            # warning | caution | note (callout semantics)
- applies: hooks               # optional, finer than the file gate
- missing-is: n/a              # finding | note | n/a when the artifact is absent
- check: For each Stop hook script in settings, grep for `stop_hook_active`.
  Flag scripts that never read it.
- source-line: "Parse `stop_hook_active` from stdin and exit early."
- why: chapters/04-hooks.md > "The events that earn their keep"
```

`check:` is imperative and tool-level (grep, stat, compare) so it can run
mechanically. `source-line` is a short verbatim quote; `why` points at the
section to open when a finding needs the full reasoning.

A checklist whose recomputed source hash no longer matches is STALE: the
chapter changed since distillation. Re-extract the affected assertions and
update `source-hash`, or leave it and let every audit flag it.

## Index

| Checklist | Source | Gate |
|---|---|---|
| `01-operating-model.md` | `chapters/01-operating-model.md` | always |
| `02-project-memory.md` | `chapters/02-project-memory.md` | always |
| `03-subagents.md` | `chapters/03-subagents.md` | agents |
| `04-hooks.md` | `chapters/04-hooks.md` | always |
| `06-mcp-and-tools.md` | `chapters/06-mcp-and-tools.md` | mcp |
| `14-agent-security.md` | `chapters/14-agent-security.md` | always |

Nothing further is planned. 05, 07, 12, 15 and 22 were assessed on 2026-08-27
and left unextracted on purpose: 05 gates on an env flag almost nobody sets, 07
is judgment rather than anything greppable, and 15 and 22 largely restate OM-10
and OM-13. The rest of the book — 08, 13, 16, 18, 19, 20, 21 — is about what you
build with Claude, which this skill does not audit. Extract another chapter only
when a real audit names a gap it would have caught, not to raise coverage.

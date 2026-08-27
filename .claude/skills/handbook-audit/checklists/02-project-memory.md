---
source: chapters/02-project-memory.md
source-verified: 2026-08-26
source-hash: 7b3ca6fc957e
extracted: 2026-08-27
gate: always
---

# Project memory and context engineering — audit checklist

Distilled from chapters/02-project-memory.md. This is the anchor checklist:
every assertion checks files any repo with a Claude workflow layer should have
or should shape correctly. Auto-memory checks are excluded — that store lives
under `~/.claude/`, outside the target repo.

### PM-01: A project CLAUDE.md exists
- severity: caution
- missing-is: finding
- check: Stat `./CLAUDE.md` and `./.claude/CLAUDE.md`. At least one must exist.
  Absence is the finding; do not substitute a README for it.
- source-line: "Run `/init` to generate a starting point in a new repo"
- why: chapters/02-project-memory.md > "The hierarchy Claude Code actually reads"

### PM-02: CLAUDE.local.md is gitignored
- severity: warning
- missing-is: n/a
- check: If `./CLAUDE.local.md` exists, grep `.gitignore` for a pattern that
  matches it and confirm `git ls-files CLAUDE.local.md` returns nothing. A
  tracked local file is one push away from a published mistake.
- source-line: "`./CLAUDE.local.md`, gitignored"
- why: chapters/02-project-memory.md > "The hierarchy Claude Code actually reads"

### PM-03: CLAUDE.md imports resolve
- severity: caution
- missing-is: n/a
- check: For each unbacktick-quoted `@path` import in CLAUDE.md (and in each
  file it imports, four hops deep), stat the referenced path relative to the
  importing file. Flag imports that resolve to nothing.
- source-line: "Imports use `@path/to/file` anywhere in the body, resolve
  relative to the file containing them, and nest four hops deep."
- why: chapters/02-project-memory.md > "The hierarchy Claude Code actually reads"

### PM-04: Imports count toward the size budget
- severity: caution
- missing-is: n/a
- check: Sum the line counts of CLAUDE.md plus every file its `@` imports pull
  in. Judge PM-05's 200-line target against that total, not the top file
  alone. Flag a small CLAUDE.md fronting a large imported payload.
- source-line: "Splitting a 400-line file into imports costs exactly the same
  tokens."
- why: chapters/02-project-memory.md > "The hierarchy Claude Code actually reads"

### PM-05: CLAUDE.md stays under 200 lines
- severity: caution
- missing-is: n/a
- check: Count lines in each project CLAUDE.md, excluding HTML comment blocks.
  Flag any file over roughly 200 lines; cite the PM-04 total when imports are
  what push it over.
- source-line: "Keep each file under roughly 200 lines, the documented target.
  Past that, adherence drops."
- why: chapters/02-project-memory.md > "The hierarchy Claude Code actually reads"

### PM-06: No memory file nears the 4 MiB silent-skip cap
- severity: caution
- missing-is: n/a
- check: Stat every CLAUDE.md and CLAUDE.local.md in the repo. Flag any file
  at or above 4 MiB — it is silently skipped — and note any file within an
  order of magnitude of the cap, since the failure gives no signal.
- source-line: "Claude Code loads a CLAUDE.md up to 4 MiB and silently skips
  anything larger."
- why: chapters/02-project-memory.md > "The hierarchy Claude Code actually reads"

### PM-07: Maintainer metadata rides in HTML comments
- severity: note
- missing-is: n/a
- check: Grep CLAUDE.md body text for changelog stamps, "updated:" lines, and
  maintainer-to-maintainer annotations sitting outside `<!-- -->` blocks.
  Suggest moving them into comments, which are stripped before injection.
- source-line: "Block-level `<!-- comments -->` in CLAUDE.md are stripped
  before injection."
- why: chapters/02-project-memory.md > "The hierarchy Claude Code actually reads"

### PM-08: Subtree-specific rules carry `paths:` frontmatter
- severity: caution
- missing-is: n/a
- check: If `.claude/rules/` exists, read each rule's frontmatter. A rule whose
  body targets one directory, language, or file pattern but lacks `paths:`
  loads at every launch; flag it. Leave unscoped any rule the repo needs to
  survive compaction — that trade is the documented exception, not a finding.
- source-line: "rules with it load only when Claude reads a matching file,
  which is the mechanism that actually keeps startup context lean"
- why: chapters/02-project-memory.md > "Rules files"

### PM-09: Skills are directories, not loose files
- severity: caution
- applies: skills
- missing-is: n/a
- check: List `.claude/skills/`. Every entry must be a directory containing a
  `SKILL.md`. Flag loose `*.md` files directly under `skills/`, and flag a
  surviving `.claude/commands/` directory — the custom-commands system was
  merged into skills.
- source-line: "`.claude/skills/<name>/SKILL.md` — a directory, not a loose
  markdown file"
- why: chapters/02-project-memory.md > "Skills"

### PM-10: Multi-step procedures live in skills, not CLAUDE.md
- severity: caution
- missing-is: n/a
- check: Grep CLAUDE.md for numbered step sequences and multi-command
  procedural blocks. A procedure invoked occasionally but loaded every session
  belongs in a skill; flag procedures longer than a few steps. One-line build
  or test commands stay.
- source-line: "Anything multi-step moves to a skill."
- why: chapters/02-project-memory.md > "Skills"

### PM-11: CLAUDE.md holds no derivable state
- severity: caution
- missing-is: n/a
- check: Grep CLAUDE.md for directory trees, file listings, dependency lists,
  and architecture inventories that `ls`, `git log`, or `package.json` can
  answer. Compare any found against the live repo; stale entries prove the
  liability. Rationale, pitfalls, and non-default conventions stay.
- source-line: "If a command can answer it (`git log`, `ls`, `package.json`),
  it is not memory, it is derivable state"
- why: chapters/02-project-memory.md > "What belongs in memory versus the repo"

### PM-12: Skill files front-load their critical instructions
- severity: caution
- applies: skills
- missing-is: n/a
- check: For each `.claude/skills/*/SKILL.md` long enough to truncate (roughly
  300+ lines ~ 5,000 tokens), locate the first imperative procedure heading.
  Flag files whose operative instructions sit in the back half behind
  background prose — compaction keeps the start and cuts the end.
- source-line: "keeping the start of the file and cutting the end"
- why: chapters/02-project-memory.md > "Compaction"

### PM-13: CLAUDE.md carries compact instructions
- severity: note
- missing-is: note
- check: Grep CLAUDE.md for a `## Compact Instructions` section (any heading
  level). Absence is a note, not a finding: recommended, not mandatory. If
  present, confirm it names what to preserve rather than restating the rules
  above it.
- source-line: "A `## Compact Instructions` section in `CLAUDE.md` tells the
  summarizer what to preserve"
- why: chapters/02-project-memory.md > "Compaction"

### PM-14: Handoff docs cache no git state
- severity: caution
- applies: handoff
- missing-is: n/a
- check: Grep HANDOFF.md and equivalents for cached git claims — "pushed",
  "clean", "ahead/behind", "up to date", "committed", "uncommitted",
  commit-count snapshots — and read the hits in context: any prose claim
  about what git currently holds counts, not only the listed terms. Flag them:
  git facts are re-derived live at resume, and a stale claim misleads where an
  absent one would prompt a lookup.
- source-line: "Git state is the canonical violation: a prose snapshot of push
  status goes stale the instant anything pushes from another terminal"
- why: chapters/02-project-memory.md > "Handoff docs"

### PM-15: Handoff docs record intent, not logs
- severity: note
- applies: handoff
- missing-is: n/a
- check: Read HANDOFF.md and equivalents for the four session-only elements:
  intent, blockers, decisions, and a "resume by" next step. Flag a handoff
  that is only a change log — everything in it a diff could answer.
- source-line: "A handoff doc records what only the session knew — intent,
  blockers, decisions, \"resume by\""
- why: chapters/02-project-memory.md > "Handoff docs"

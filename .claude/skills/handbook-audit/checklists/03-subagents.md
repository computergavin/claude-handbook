---
source: chapters/03-subagents.md
source-verified: 2026-08-26
source-hash: c0173fd880ec
extracted: 2026-08-27
gate: agents
---

# Subagents checklist

Distilled from the subagents chapter. Runs only when the target has a non-empty
`.claude/agents/`. Model/effort tiering assertions live here — the cost chapter's
tiering advice dedupes into SA-04.

### SA-01: Every agent definition has name and description frontmatter
- severity: caution
- missing-is: finding
- check: For each `.claude/agents/*.md` (scan recursively), parse the YAML front
  matter. Flag any file missing a `name` or a `description` field.
- source-line: "Subagents live in `.claude/agents/*.md` as markdown with front
  matter."
- why: chapters/03-subagents.md > "Definition"

### SA-02: Descriptions state when to invoke the agent
- severity: note
- missing-is: n/a
- check: Read each agent's `description`. Flag descriptions that only say what
  the agent is, with no trigger condition ("Use after ...", "Use when ...", or
  an equivalent stated invocation cue).
- source-line: "Independently verifies an implementation against its stated
  requirements. Use after any non-trivial change."
- why: chapters/03-subagents.md > "Definition"

### SA-03: Verifier and reviewer agents carry a read-only tools allowlist
- severity: caution
- missing-is: n/a
- check: Identify agents whose name, description, or body marks them as a
  verifier, reviewer, or auditor. Flag any that omit the `tools` field or whose
  allowlist includes Edit, Write, or NotebookEdit.
- source-line: "Give it read-only tools so it physically cannot \"just fix it\"
  and collapse the two roles back together."
- why: chapters/03-subagents.md > "Definition" (Builder / verifier split)

### SA-04: Grunt-work agents are tiered down in model or effort
- severity: caution
- missing-is: n/a
- check: Identify agents whose description or body is search, log-scanning,
  test-running, polling, or similar mechanical work. Flag any that declare
  neither a cheaper `model` (haiku, sonnet) nor `effort: low` — inheriting the
  parent model by default.
- source-line: "Route grunt work — file search, log scanning, API polling — to a
  cheaper model and keep the expensive one for architectural reasoning."
- why: chapters/03-subagents.md > "Model tiering"

### SA-05: Agents that could loop declare maxTurns
- severity: caution
- missing-is: n/a
- check: Identify agents whose body describes iterative work — retry until
  green, poll, watch, fix-and-rerun. Flag any such agent with no `maxTurns`
  field in its front matter.
- source-line: "Set it on anything that could loop."
- why: chapters/03-subagents.md > "Definition"

### SA-06: Agent bodies specify a result contract
- severity: caution
- missing-is: n/a
- check: Read each agent body. Flag bodies that never specify the return shape:
  no output format (table, list, fields), no empty-result sentinel, and no
  length cap. Any one of the three present passes; all three present is the
  target state.
- source-line: "Name the fields, name the sort order, name the empty-result
  sentinel, and cap the length (\"at most 10 findings\")."
- why: chapters/03-subagents.md > "Orchestrator patterns" (Result contracts)

### SA-07: Agent bodies state an explicit boundary
- severity: caution
- missing-is: n/a
- check: Read each agent body for a stated prohibition ("Never ...", "Do not
  ...", "must not touch ..."). Flag write-capable agents (Edit/Write in tools,
  or no tools field) whose body names nothing they must not do.
- source-line: "The boundary. What it must not touch, so its lack of context
  can't hurt you."
- why: chapters/03-subagents.md > "Prompting a delegation"

### SA-08: No Agent(type) restriction syntax inside a subagent tools field
- severity: caution
- missing-is: n/a
- check: Grep each agent's `tools` field for `Agent(` with a parenthesized type
  list. Flag every occurrence: the restriction is silently ignored there, so
  the author believes a constraint that is not enforced.
- source-line: "Inside a subagent's own `tools` field, any type list in the
  parentheses is ignored."
- why: chapters/03-subagents.md > "Definition"

### SA-09: Omitted tools fields are deliberate
- severity: note
- missing-is: n/a
- check: List agents with no `tools` field — each inherits every tool,
  including Edit, Write, and Agent. Flag them for confirmation that full
  inheritance is intended, especially where the body implies read-only work.
- source-line: "Omitted means it inherits everything."
- why: chapters/03-subagents.md > "Definition"

### SA-10: Project agent definitions are committed
- severity: note
- missing-is: n/a
- check: If the target is a git repo, run `git ls-files .claude/agents/` and
  compare against the directory listing. Flag agent files that are untracked
  or matched by `.gitignore`.
- source-line: "`.claude/agents/` (project, commit it)"
- why: chapters/03-subagents.md > "Definition"

### SA-11: Project agent names do not silently shadow personal agents
- severity: note
- missing-is: n/a
- check: Compare `name` fields in `.claude/agents/*.md` against
  `~/.claude/agents/*.md`. Flag duplicate names: the project definition wins,
  and the personal one stops applying in this repo without any signal.
- source-line: "Same name, higher location wins."
- why: chapters/03-subagents.md > "Definition"

### SA-12: background agents do not depend on interactive tools
- severity: note
- missing-is: n/a
- check: For each agent with `background: true`, inspect its `tools` allowlist.
  Flag tools outside file tools, Bash, web tools, and messaging — the reduced
  background tool set drops interactive tools, and permission prompts surface
  in the main session, where they stall unnoticed.
- source-line: "Background agents also run with a reduced built-in tool set —
  file tools, Bash, web tools, and messaging survive; interactive tools don't"
- why: chapters/03-subagents.md > "Background agents"

---
source: chapters/01-operating-model.md
source-verified: 2026-08-26
source-hash: 192bc4274753
extracted: 2026-08-27
gate: always
---

# Operating model checklist

Distilled from the operating-model chapter: layer placement, the permission
gate, the undo layer, and the headless trust boundary. Everything here is
checkable by reading files in the target repo.

<!-- OM-01 retired at extraction: the instruction-backed-by-enforcement check
is owned by HK-01 in 04-hooks.md, which carries the layer test in full. Do not
reintroduce it here on re-extraction, or a single unenforced prohibition
double-reports as two warnings. -->

### OM-02: Committed settings.json carries the permission policy

- severity: caution
- missing-is: finding
- check: Stat `.claude/settings.json` and confirm it is git-tracked
  (`git ls-files .claude/settings.json` non-empty). Read it and confirm a
  `permissions` block with explicit `allow`, `deny`, or `ask` lists exists.
  Flag absence of the file, an untracked file, or a file with no permissions
  block.
- source-line: "write your allow/deny lists into `.claude/settings.json` and
  commit them."
- why: chapters/01-operating-model.md > "The permission gate"

### OM-03: Local settings do not accumulate project policy

- severity: caution
- missing-is: n/a
- check: Read `.claude/settings.local.json` if present. Flag allow rules that
  duplicate or belong beside the committed file's rules — general-purpose
  project commands (test runners, linters, build tools) rather than
  machine-specific paths. Also flag the file itself being git-tracked; it is
  the per-machine overflow, not the policy.
- source-line: "Per-session clicking is the same policy, unaudited."
- why: chapters/01-operating-model.md > "The permission gate"

### OM-04: Command patterns keep the load-bearing trailing space

- severity: caution
- missing-is: n/a
- check: Grep all `Bash(...)` rules in `.claude/settings.json` and
  `settings.local.json` for patterns where `*` directly follows an
  alphanumeric character (e.g. `Bash(git diff*)`). Flag each: without the
  space the rule also matches sibling commands like `git diff-index`, which
  widens allows and misaims denys.
- source-line: "The space in `Bash(git diff *)` is load-bearing"
- why: chapters/01-operating-model.md > "The permission gate"

### OM-05: No rules target stripped wrapper commands

- severity: caution
- missing-is: n/a
- check: Grep permission rules for `Bash(timeout ...)` and `Bash(nohup ...)`
  patterns. Flag them: wrappers are stripped before matching, so these rules
  never fire — a deny written this way blocks nothing while looking like it
  does.
- source-line: "wrappers like `timeout` and `nohup` are stripped before
  matching."
- why: chapters/01-operating-model.md > "The permission gate"

### OM-06: Allow rules are not shadowed by a broader deny

- severity: note
- missing-is: n/a
- check: For each allow rule in settings, test whether any deny rule's pattern
  subsumes it (deny evaluates first and specificity does not reorder). Flag
  shadowed allows as dead rules — behavior stays safe, but the file misstates
  the actual policy.
- source-line: "a deny like `Bash(git push *)` beats any narrower allow."
- why: chapters/01-operating-model.md > "The permission gate"

### OM-07: No committed bypassPermissions default

- severity: warning
- missing-is: n/a
- check: Grep `.claude/settings.json` for
  `"defaultMode": "bypassPermissions"`. Flag it: the committed file would
  skip the permission gate entirely for every session and every clone,
  including headless runs.
- source-line: "`bypassPermissions` — skips the gate entirely."
- why: chapters/01-operating-model.md > "The permission gate"

### OM-08: Sandbox is enabled, or its absence is recorded

- severity: note
- missing-is: note
- check: Grep `.claude/settings.json` and `settings.local.json` for
  `"sandbox"` with `"enabled": true`. If absent, grep CLAUDE.md and memory
  files for a documented reason (platform, incompatible tooling). Rules gate
  attempts only; without the sandbox nothing confines what a running command
  reaches.
- source-line: "Rules gate what Claude may attempt; the sandbox gates what a
  command can reach once running."
- why: chapters/01-operating-model.md > "The permission gate"

### OM-09: The target is under git

- severity: warning
- missing-is: finding
- check: Stat `.git` at the target root (or confirm `git rev-parse
  --is-inside-work-tree` would succeed from the directory listing). Flag its
  absence: checkpoints cover only Claude's file edits for 30 days and are not
  version control, so a repo without git has no undo layer for Bash, scripts,
  or subagent edits.
- source-line: "git and hooks cover the rest, which is why \"never
  force-push\" is a hook and not a hope."
- why: chapters/01-operating-model.md > "Checkpoints are the undo layer"

### OM-10: Grunt-work subagents route effort down

- severity: caution
- applies: agents
- missing-is: n/a
- check: Read each `.claude/agents/*.md` frontmatter. For agents whose
  description marks them as high-volume mechanical work (search, scan,
  review, triage, log analysis), confirm the frontmatter sets `effort` low or
  overrides `model` to a cheaper one. Note agents that inherit the session's
  full spend for grunt work.
- source-line: "Route grunt-work subagents to `low`; keep `max` for the turn
  that needs it."
- why: chapters/01-operating-model.md > "Effort is a dial, not a constant"

### OM-11: Headless runs against foreign repos pass --bare

- severity: warning
- applies: headless
- missing-is: n/a
- check: Grep scripts and CI files for `claude -p` invocations that operate
  on a repo the runner did not author — a clone of an external URL, a
  checked-out PR, vendored third-party code. Flag any such invocation
  without `--bare`: `-p` skips the trust dialog but still executes the target
  repo's hooks and connects its `.mcp.json` servers.
- source-line: "In a repo you didn't write, that is arbitrary code execution
  on your machine."
- why: chapters/01-operating-model.md > "Sessions have a lifecycle"

### OM-12: Headless permissions come from committed config

- severity: caution
- applies: headless
- missing-is: n/a
- check: For each `claude -p` invocation in scripts or CI, confirm its
  permissions are supplied by `--allowedTools`, an explicit
  `--permission-mode`, or rules present in the committed
  `.claude/settings.json`. Flag invocations that only work because of rules
  accumulated in `settings.local.json` — CI and other machines never see
  that file.
- source-line: "permissions supplied by `--allowedTools` and the committed
  settings file"
- why: chapters/01-operating-model.md > "Sessions have a lifecycle"

### OM-13: Scheduled headless runs log their own spend

- severity: note
- applies: headless
- missing-is: n/a
- check: For `claude -p` invocations wired into cron or CI (not one-off dev
  scripts), check for `--output-format json` and a read of
  `total_cost_usd`. Note runs that spend on a schedule with no cost record.
- source-line: "The JSON output also carries `total_cost_usd`, so a cron job
  can log its own spend."
- why: chapters/01-operating-model.md > "Sessions have a lifecycle"

### OM-14: CLAUDE.md holds facts, not voice

- severity: note
- missing-is: n/a
- check: Grep root and nested `CLAUDE.md` for tone and persona directives —
  "respond in", "your tone", "speak as", "always answer concisely", role-play
  framing. Note hits: voice belongs in an output style, which lands in the
  system prompt; `CLAUDE.md` is injected after it and is for conventions,
  architecture, and commands.
- source-line: "Voice goes in a style; facts go in `CLAUDE.md`."
- why: chapters/01-operating-model.md > "Output styles are not CLAUDE.md"

<!-- OM-15 retired at extraction: the SessionStart/compact re-injection check
is owned by HK-12 in 04-hooks.md, where the recipe lives. Do not reintroduce
it here on re-extraction. -->

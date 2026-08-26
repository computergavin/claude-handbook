---
title: Field notes — Kaitaku
status: draft
verified: 2026-08-26
---

The lessons that survive a long agentic project are the ones a hook, a test, or a
written trigger enforces — never the ones you resolve to remember.

Kaitaku is the Daily Japanese app, a JLPT-N5 iOS study tool: flashcards on an FSRS
scheduler, kana tracing, grammar reference, an AR object-labelling mode, shipped to
TestFlight by a solo founder with Claude Code doing most of the building. Ten weeks
of milestone logs — over two hundred entries — produced the notes below. Everything
here is dated and traceable to a specific session.

## The constraints that shaped the work

**Offline-first iOS means no telemetry to debug from.** Like Ganbei, there is no
dashboard to consult after a crash. All confidence has to be manufactured before
shipping, which puts the entire weight on the verification harness — and makes the
harness's blind spots the most important thing to know about it. Three of the field
notes below are about a green signal that meant nothing.

**The Xcode project is generated.** `project.yml` is the source of truth;
`xcodegen generate` produces the `.xcodeproj` the build actually reads. Every
generated artifact in a repo is a place where "the diff looks right" and "the build
includes it" quietly diverge.

**A pure-logic SPM core enables headless verification.** All scheduling, dataset,
and game logic lives in a UIKit-free package, so `swift test` exercises it with no
simulator at all. UI gets `xcrun simctl launch` plus screenshots. Everything the
harness structurally cannot reach — finger-drag feel, real TTS voices, OS permission
dialogs, VoiceOver, StoreKit purchase UI — is named per milestone in an explicit
"device pass" flag for the human to check on hardware. An implicit verification gap
is a silent unknown; a flagged one is a tracked handoff item.

**Language data has a provenance rule.** Claude is the engine, not the source of
truth for the Japanese: vocab and readings come from JMdict/Kanjidic2, example
sentences from Tatoeba, stroke order from KanjiVG, with native review before
advanced content ships. English pedagogy may be Claude-authored. The first field
note below is how that rule was born.

**A solo founder on metered quota routes work by cost.** The premium model does
shaping, judgment, and blast-radius calls once, writes them into `SPEC-*.md` docs
with exact numbers and file lists, and tags the mechanical remainder `[sonnet]` in
the TODO. Cheaper sessions execute against the spec with zero re-derivation. A spec
doc converts a one-time judgment call into a durable, referenceable fact — the
alternative is paying premium-model prices to re-decide the same thing every
session, inconsistently.

## The ritual that made this chapter possible

> [!PATTERN] The verbatim master log
> A `Stop` hook regenerates a prompt-level record of every session: each user
> prompt and each response, written verbatim to `docs/master-log/<date>-<id>.md` by
> a build script, every time a turn ends. Not a summary — summaries drift, and the
> most useful evidence (the exact wording of a correction, the exact moment a rule
> was born) is precisely what summarisation drops. Every field note in this chapter
> cites a line from that log or from the milestone log built on top of it. If you
> want to mine a project for lessons later, the logging has to be a hook running
> now; you cannot reconstruct prompt-level history after the fact.

The master log also produced its own best security lesson — see the scrubber note
under Guardrails.

## Provenance

> [!FIELD] 2026-06-30 — The provenance rule came from catching Claude's own fabrication
> **What happened.** Building the grammar reference, Claude authored
> `grammar.json` itself — 20 grammar points, 32 hand-written Japanese example
> sentences — and shipped it as working content. The user's next message flagged
> the general risk of AI-generated Japanese being treated as authoritative, and
> Claude recognised in the same turn that the file it had just written was exactly
> that.
>
> **Why it happened.** An LLM produces fluent, structurally-correct-looking
> language content that is indistinguishable from curated data by inspection.
> Nothing marks it as unverified. Without a standing rule separating engine from
> source of truth, generated content silently accumulates as if it were vetted.
>
> **What changed.** The provenance rule went into `CLAUDE.md`, the TODO (top,
> high priority), and long-term memory in that same turn — and `grammar.json`
> itself became the first tracked debt item, a hard ship-blocker until re-anchored
> to real sources. Every later content decision checks itself against the rule
> before building.

## Verification

Four notes, one theme: a green signal is a claim about what was tested, not about
what ships.

> [!FIELD] 2026-06-21 — A green suite validated a scheduler the app never runs
> **What happened.** The shipped `FSRSScheduler()` default had
> `enableShortTerm: true`, but every one of the 50 green tests explicitly forced
> `false`. The suite was fully passing and validating a configuration that never
> shipped; under the real default, `previewIntervals` silently returned a
> misleading 0 days for new cards.
>
> **Why it happened.** Unit tests exercise exactly the instance they construct,
> not the instance production defaults to. A suite can be 100% green while testing
> the wrong object, and adding more tests in the same style never surfaces it.
>
> **What changed.** An independent adversarial-review subagent found it — a class
> of bug tests structurally can't see about themselves. One new test constructs
> the bare default with no overrides to pin the fix, and the adversarial review
> became a standing ritual at every phase boundary.

> [!FIELD] 2026-07-02 — Debug builds lied about performance by 30x
> **What happened.** A feasibility spike for on-device YOLOX inference measured
> Swift-side decode at 33.9ms in a Debug build — against 1.16ms in Release. The
> Debug number would have failed the 15–30fps gate and killed the feature falsely.
>
> **Why it happened.** Swift's `-Onone` mode distorts tight-loop, per-element
> code far beyond anything real devices exhibit. A perf spike run under the
> default debug scheme reads as a false no-go.
>
> **What changed.** The spike compiles in Release too, reachable only through its
> own launch-argument door (`-arSpike`), and "Release is the honest number" is
> restated at every subsequent performance claim in the log. Benchmark
> optimisation level is part of the measurement, not an environment detail.

> [!FIELD] 2026-07-02 — A documented finding from one milestone broke the next
> **What happened.** The spike documented a linear byte-copy for reading the
> CoreML output tensor. The live camera pipeline reused it — and on device, the
> ANE pads each 85-value anchor row to 96, so the linear copy misaligned every
> anchor after the first and produced 100+ garbage detections per frame.
>
> **Why it happened.** A prior milestone's finding was carried forward as settled
> fact into a new context without re-verification — even though the symptom
> (100 boxes where 1 was expected) was implausible enough to demand a ground-truth
> check immediately.
>
> **What changed.** Diagnosis by ground-truth replay: dump one raw device frame
> to disk, pull it to the Mac, run the exact pixels through the original PyTorch
> model. Torch said 1 box, device said 100+ — the bug was device-side stride
> handling, proven, not inferred. The fix reads `rowBytes` from the tensor's own
> strides, and a torch-parity check now runs on every future model conversion.
> When an on-device pipeline misbehaves, replay the identical input through the
> reference implementation before reasoning about device internals in the
> abstract.

> [!FIELD] 2026-07-18 — A green screenshot proved nothing about StoreKit
> **What happened.** After wiring a StoreKit configuration file into the
> generated scheme, the paywall's price row read "Loading…" in the sim-verify
> screenshot. It looked like a bug. It wasn't.
>
> **Why it happened.** `xcrun simctl launch` bypasses Xcode's scheme machinery
> entirely, so a StoreKit Configuration attached to a scheme's LaunchAction never
> attaches to a simctl-launched process. It activates only on an actual Xcode
> Cmd-R run. The harness has a structural blind spot for this subsystem.
>
> **What changed.** Logged as "a known verification gap, not a code defect," and
> the live purchase/restore round-trip moved permanently to the human device
> pass. Know which subsystems your harness cannot see, and say so in the log
> instead of letting a screenshot imply coverage it doesn't have.

The same harness collected smaller scars: the `/sim-verify` launch-arg loop
silently misfired under zsh because unquoted `$args` doesn't word-split there —
`${=args}` does (2026-08-19) — and tap automation needs `idb`, which a blocked brew
tap kept out of the sandbox, so tap behaviour rides the device pass too.

## The generated project

> [!FIELD] 2026-07-05 — New source files don't exist until you regenerate
> **What happened.** A newly added `Speaker.swift` under `App/` looked complete
> in the diff and wasn't part of the build at all. The same trap re-fired at later
> milestones.
>
> **Why it happened.** The `.xcodeproj` is a generated artifact of `project.yml`,
> and the build reads the artifact, not the truth. Adding or removing a file
> leaves a stale, silently-incomplete project until `xcodegen generate` runs.
>
> **What changed.** A hard rule in `CLAUDE.md`: edit `project.yml`, then
> `xcodegen generate`, required whenever files are added or removed under `App/`.
> The general form: wherever a generated artifact sits between your edit and the
> toolchain, the regeneration step belongs in project memory as a rule, because
> the failure mode is invisible in the diff.

The first commit nearly taught a harsher version of the same lesson: the initial
`.gitignore` excluded `.build/` but not `build/`, and 132 xcodebuild artifacts were
staged alongside the first 41 real files. A lucky substring match surfaced it
before the remote existed, and the repo was re-initialised for clean history
rather than purging a pushed one (2026-06-21). Check what's staged before the
first push; history scrubbing is the expensive version of `git status`.

## Guardrails and their false positives

A pre-commit hook blocks any staged added line matching
`/secret|key|token|password|\.env/i`. It is deliberately blunt, and living with it
produced two lessons — one about false positives, one about the single false
negative that mattered.

> [!FIELD] 2026-07-02 — The secret grep blocked "keyboard"
> **What happened.** The AR dictionary commit tripped the secret hook on the word
> "keyboard" — a pure substring match on "key," with no secret anywhere in the
> changeset.
>
> **Why it happened.** A naive regex can't tell credential-flavoured "key" from
> keyboard, monkey, or turkey. And the hook's hit list is hidden from the agent
> by design — only "hook error" comes back — so the agent can't read why it
> failed.
>
> **What changed.** A standing ritual. First, self-check with the hook's own
> pattern: `git diff --staged | grep "^+" | grep -iE "secret|key|token|password|\.env"`.
> Second, reword identifiers where possible — `.keys` becomes `.map { $0.0 }`,
> `practiceID` deliberately not `practiceKey`. Third, only when the string is
> genuinely unrenameable (Apple-spec `INFOPLIST_KEY_*` names, SF Symbols) does the
> workflow escalate: leave the change staged, write the message to
> `.git/<milestone>-commit-msg.txt`, and the human runs `git commit -F`. Reword
> around the hook; escalate only at the unrenameable.

> [!FIELD] 2026-07-05 — Two reasonable policies combined into a credential leak path
> **What happened.** The first end-of-week review found that the master-log
> pipeline writes verbatim transcripts to `.md` files — and `.md` files are
> exempt from the secret hook by design, so prose isn't constantly false-flagged.
> Any credential ever pasted into a prompt would have flowed straight into a
> committed plaintext file.
>
> **Why it happened.** Two independently sensible policies — exempt docs from a
> code-focused scanner; log full transcripts for auditability — composed into a
> hole neither predicts alone. The exemption assumed docs are human-authored; a
> transcript log is machine output wearing a `.md` extension.
>
> **What changed.** The log build script now scrubs credential-shaped strings
> (`sk-`, `ghp_`, `AKIA`, `xox`, `AIza`, JWTs, PEM blocks, labelled assignments)
> to `[scrubbed]` before writing, verified against all 22 existing sessions at
> zero hits — preventive, not reactive. The scrubber's own regexes are assembled
> from split string literals so its source doesn't trip the very hook it
> compensates for. Audit every pipeline that copies raw content into an exempted
> file type.

The same review pass modelled how to consume subagent findings: two of the
reviewer's claims were checked against source, found wrong, and explicitly dropped
with reasons. Subagent output is candidate findings, not ground truth — verify
before filing, and name what you dropped.

## Fuses and tripwires

The project's decision hygiene rests on one move: instead of "decide later," write
down the named trigger condition and the complete resulting action at decision
time.

> [!PATTERN] Tripwire decisions
> An open question left as "we'll decide later" spends a future session's
> judgment with less context than the original discussion had. Instead, write the
> exact trigger ("adopt telemetry only when a named feature-investment decision
> cannot be answered by App Store Connect analytics, feedback attachments, or
> asking testers") and pre-draft the resulting action — kaitaku's telemetry
> tripwire includes the capped event taxonomy and the privacy-label copy change,
> ready to execute. A future session checks the trigger mechanically instead of
> re-litigating the tradeoff.

> [!FIELD] 2026-07-30 — A written tripwire doesn't fire itself
> **What happened.** On 2026-07-08 a fuse was filed: WelcomeView's "Completely
> free… nothing locked" copy must change in the same build that ships the paid
> unlock. Three weeks later, a pre-launch audit agent grepped the shipped
> TestFlight build and found the claim still there — in the exact build carrying
> the $9.99 unlock. The fuse never fired.
>
> **Why it happened.** A conditional note is inert. It has no mechanism to notice
> its trigger becoming true unless something re-reads it against current reality,
> and the forward momentum of shipping — archive, upload, App Store Connect —
> contains no natural moment that references it.
>
> **What changed.** The TODO now carries an explicit fuse ledger tracking each
> conditional note's tripped/untripped state, and audit passes check the ledger
> rather than trusting that a filed intention executed itself. The audit that
> caught it was itself a pattern worth keeping: five read-only Sonnet agents,
> each assigned one orthogonal dimension (copy truthfulness, store paperwork,
> licensing, dependency graph, StoreKit compliance) — and two independently
> converging on a second gap (no privacy-policy URL existed) functioned as free
> cross-validation.

Settled decisions need the complementary move. When a question reopens one — a
pricing ladder, opt-in telemetry — re-read the ratified text before answering:
"pull the exact tripwire ruling first so we're arguing against the real text"
(2026-07-23). A remembered gist drifts. And when a suggestion the user has killed
twice keeps regenerating — an "enhanced voice" TTS idea that had already hit
Apple's ceiling — the ruling goes into agent memory, not just the session log,
because the log won't be read before the next time the model independently
re-invents it (2026-08-25).

## The fleet

> [!PATTERN] Sonnet fleets, partitioned by file, not by finding
> For a batch that cross-cuts many files — an accessibility audit landing across
> 11 files, seven grammar teach sheets across five clusters — dispatch parallel
> Sonnet subagents that each own a disjoint set of files, run no commits and no
> builds of their own, and let the orchestrator do exactly one integration build
> afterward. Partitioning by finding produces write collisions on shared files;
> partitioning by file ownership guarantees zero collisions regardless of how the
> findings overlap. Kaitaku ran this repeatedly (2026-07-13, 2026-07-17) with
> five builders and zero collisions, and it is the concrete mechanism behind the
> quota rule of routing grunt work to cheaper models. One practical ceiling,
> measured once and scripted: review subagents fail on oversized inputs, so
> `wc -c` the filtered diff and chunk anything over ~20KB.

> [!FIELD] 2026-07-17 — The integration build caught the orchestrator, not the agents
> **What happened.** Before dispatching five builders, the orchestrator pre-wired
> the shared plumbing — new `TeachSheet` cases, switch arms — and missed that
> `PathRouter.swift` had its own separate exhaustive switch over the same enum.
> The single integration build failed on the orchestrator's edit, not on any
> agent's.
>
> **Why it happened.** Orchestrator-authored "just plumbing" feels
> safe-by-construction because it isn't the creative part. But any hand-written
> change that must stay exhaustive across multiple call sites is exactly as
> bug-prone as agent-written code.
>
> **What changed.** Nothing needed to — the build-once step already covered it,
> one fix, same session. The lesson is what the step is for: the integration
> build verifies the orchestrator's own edits, not just the fleet's.

The fleet pattern has a mid-build counterweight: specs get overridden when they
collide with standing invariants. A shaped spec called for disabling a "Start the
row" button; the orchestrator overrode it mid-build because a standing invariant —
established earlier, missed by the fresh shaping session — says that button is
never disabled (2026-08-19). Specs are shaped without the full history loaded; the
build phase is the second chance to catch one that contradicts a load-bearing
rule. Log it as an override, not a bug fix, so the record shows the spec was wrong
and corrected deliberately. Scope runs the same way in the other direction: a
fully-shaped test-out feature was filed to TODO as "user call: file, don't build"
(2026-08-19) — being able to build something in-session is not a reason to; scope
is the user's decision, and the log should distinguish "chose not to" from "ran
out of time."

## Schema windows

> [!FIELD] 2026-06-24 — Schema fields are free until first ship, then cost a migration
> **What happened.** Before TestFlight, adding a field to a SwiftData `@Model`
> costs nothing — no persisted users to migrate. After, every field needs a
> `VersionedSchema` plus `MigrationPlan`. A granular `ReviewLog` history table,
> needed only by stats features months away, landed in a pre-ship schema bump
> specifically because the free window was closing; `SDCard.createdAt` later rode
> the same bump at marginal cost near zero.
>
> **Why it happened.** The cost of a schema change is not constant over a
> project's life — near-zero pre-ship, materially higher after. The right time to
> add a foreseeable field is set by the external deadline, not by when the
> consuming feature gets built.
>
> **What changed.** "Batch foreseeable fields into the last unlocked bump" became
> the standing policy. The corollary cut the other way too: when the pet feature
> was killed (2026-07-22), its speculative empty schemas were explicitly voided
> before first ship rather than left to become permanent migration baggage.

Copyleft data got its own structural rule: any CC BY-SA dataset (KanjiVG stroke
order, the JMdict-derived AR dictionary) lives in its own file with license
metadata embedded in the JSON itself, so even an out-of-context copy of that one
file stays attributed while the rest of the app's data keeps its own provenance.
And where a dataset ships as two copies — `Data/` for tests, `App/Resources/` for
the bundle — a sync test enforces byte-identity across *all* of them:
`BundledCopySyncTests` generalised a one-dataset guard to all four and caught real
drift in `ar-object-dictionary.json` on its first run (2026-07-04). An invariant
tested only for the dataset that motivated it lets every other dataset drift.

## Session hygiene

> [!FIELD] 2026-07-05 — Git facts in a handoff doc are worse than no facts
> **What happened.** `HANDOFF.md` used to record push status and unpushed-commit
> lists. It was caught stale twice (2026-07-05, again 2026-07-09), and a health
> scan caught a live instance: the doc named one unpushed commit while
> `origin/main` already matched HEAD.
>
> **Why it happened.** Git state changes underneath a static file the instant
> anything pushes from another terminal. A prose snapshot of derivable state has
> no way to invalidate itself, so a stale claim actively misleads the next
> session where an absent one would just prompt a lookup.
>
> **What changed.** The wrap-up ritual bans git-derivable state from the handoff
> — only intent, blockers, decisions, and "resume by" survive — and the resume
> ritual re-derives git facts live with `git fetch` + `git status` every time.
> The rule generalises: a handoff doc records what only the session knew; it
> never caches what a command can answer.

The milestone log itself needed a mechanical guard: inserting a new entry at the
top ate the previous entry's bold header line three separate times across the
project. The fix was not "be more careful" — it was a scripted diff-shape
assertion in the `/milestone` skill: after insertion,
`git diff BUILD-LOG.md | grep '^-- \*\*'` must return nothing, because adding an
entry only inserts lines, so the diff must delete no header. Any output means a
header was clobbered and gets restored from `git log -S` before proceeding. When
the same corruption happens twice, the third defence is an assertion, not a
resolution.

Backlog triage got the same treatment: every TODO item carries an altitude label —
`[critical]`, unlabeled normal work, `[abstract]` needs shaping, `[ponder]` open
question — attached at filing time (convention set 2026-07-03). "What's gating
beta?" is then answered by grep-and-group instead of re-judging 69 items from
scratch, and health scans count by label to gauge backlog shape. Priority judgment
paid once, at filing, instead of at every status question.

## What transfers

Strip the iOS specifics and the chapter compresses to five moves. Log verbatim,
via a hook, from day one — you cannot mine what you didn't record. Distrust green
signals until you know what the harness structurally cannot see, and write those
gaps down as named handoff items. Give every guardrail a false-positive ritual and
audit its exemptions for pipelines that launder machine output through them. Write
triggers and actions instead of open questions — then remember a written trigger
still needs an auditor, because fuses don't fire themselves. And when work fans
out, partition by file, build once, and point the integration build at your own
edits first.

---
title: Field notes — Ganbei
status: draft
verified: 2026-08-26
---

Worked examples from a shipped iOS party game app. This chapter is the reason the
handbook exists: general patterns are cheap, but the ones that survived contact with
a real App Store release are the ones worth writing down.

## The constraints that shaped the work

Ganbei is deliberately austere as software: fully offline, no accounts, no analytics
SDKs, SwiftUI-first, dark UI with neon accents, ten-plus games with Finger Roulette
as the hero feature and a Party Mode alongside it, monetised as a single one-time
IAP unlock at $1.99.

Every one of those constraints changes how an agent should be pointed at the
codebase, and it's worth being explicit about why.

**No analytics means no telemetry to debug from.** There is no dashboard to ask what
users did before the crash. Verification has to happen before shipping, which pushes
weight onto the builder/verifier split and onto tests as the only feedback loop that
exists. A verifier subagent that reports what the code actually does — rather than
what it was supposed to do — is doing the job telemetry would otherwise do.

**Fully offline means the whole system is inspectable.** Every state transition is
local, so a subagent can reason about the entire behaviour of a game from source
alone. That's rare, and it makes exhaustive review genuinely tractable in a way that
a networked app never is.

**One-time IAP means the purchase path is the only irreversible surface.** Almost
everything else in the app is recoverable in an update. Whatever guards you put on
StoreKit code should be hooks, not instructions.

> [!WARNING] Slot — purchase path guardrails
> Record the exact `PreToolUse` matcher protecting the StoreKit and entitlement
> files here once it's written. This is the one place where an agent editing without
> review costs real money.

> [!FIELD] 2026-07-22 — The escape hatch that depended on the machinery it escaped
> **What happened.** `-debugUnlockAll YES` existed so paid games could be tested
> without a real StoreKit product. Paid tiles still read "Locked" after 20+ seconds.
>
> **Why it happened.** The debug flag was applied at the *end* of
> `refreshEntitlements()` — after `loadProduct()` and a full walk of
> `Transaction.currentEntitlements`. On a Simulator with no StoreKit config, either
> step can sit unresolved forever, so the bypass was gated on the exact async system
> it existed to bypass. A second, compounding bug rode along: the home screen's lock
> badge read `module.isFreeInV1` from the catalog and never consulted the
> entitlement store at all — every paid tile said Locked in production too.
>
> **What changed.** The flag is now applied synchronously in `EntitlementStore.init`
> before any `await`, so it structurally cannot depend on StoreKit. The standing
> checks for any paywall: does the test bypass touch the async path under test, and
> does the lock-state UI actually read the entitlement store rather than a
> hardcoded catalog flag.

## Per-game specs

Ten-plus games means ten-plus small, self-contained specifications. The question was
whether a shared spec format keeps agent-written game modes consistent. The answer
that held up: yes, but the format that worked was a code contract, not a document.

> [!FIELD] 2026-07-27 — The protocol was the spec
> **What happened.** Every game mode from M7 Truth or Dare through M39 Would You
> Rather answers the same fixed checklist in code, not in a doc — through two
> conformances, not one. Each game's `PartyGameModule` conformance carries
> `blurb`/`howToPlay` for the rulebook sheet and locked-game preview. Each game's
> case in the separate `PartyModuleID` enum (Core) carries a `heatWindow`
> (0.0–1.0, how the tier system tunes intensity), `assignsVictim` (does the round
> name one loser or is everyone in), and `minimumCrew` (floor on player count).
> There was never a prose spec file per game.
>
> **Why it happened.** Two separate compile-time checks do what a markdown
> template only suggests. Adding game #11's `PartyGameModule` conformance forces
> an agent to write a blurb and a how-to-play, because the type won't satisfy the
> protocol otherwise; adding game #11's `PartyModuleID` case forces it to answer
> heat window, victim assignment, and crew floor, because the enum's exhaustive
> switches won't compile otherwise. The one seam this doesn't cover: the module's
> string `id` has to match its `PartyModuleID` raw value by hand across the
> App/Core boundary, and Core can't see App to check it — `PartyModeView` asserts
> the mapping at DEBUG runtime instead of at compile time. A spec doc drifts
> silently; a broken build doesn't — but a string match nobody's compiler is
> watching still can.
>
> **What changed.** New games get no spec document. They get a `PartyGameModule`
> conformance, a `PartyModuleID` case, and a brief that reads as a diff against
> the nearest existing game — the Tiger Machine brief says "Integration mirrors
> SpinWheel," names which juice is reused (SpinWheel's frame-loop and
> deceleration curve) and which feedback events are genuinely new. Naming the
> reuse is what stops each agent from quietly reinventing wheel-deceleration
> curves and feedback taxonomies per game.

Cross-cutting features — the things a protocol can't capture — did get documents,
but the same document every time.

> [!PATTERN] Name the contract, don't re-derive it
> When the four Chinese chain-games were designed as one shared engine
> (2026-07-23), the design doc opened by declaring "Same contract as
> PARTY-MODE.md: problem → decisions → the hard constraint → Core/App split → build
> order → explicit non-goals." The fixed shape forces the same load-bearing
> questions to get answered before code every time, and citing the prior doc by
> name is cheaper and more binding than inventing a fresh structure. The
> "deliberately not in v1" section earns its place: it's the only part that stops
> scope from being re-litigated mid-build.

Deciding *which* games to build got its own shape, from the Subagents chapter's
toolbox rather than a spec at all.

> [!PATTERN] Rank by agreement, not by finder
> Four research agents swept disjoint partitions — Western classics,
> Korean/Japanese/TW-HK/SEA games, competitor apps and their reviews, phone-native
> mechanics — each against the existing 28-game catalog and the standing rejected
> list. Results were ranked by how many passes independently surfaced the same
> candidate, not by any one agent's enthusiasm for its own find. "Cross-validated
> by 2+ passes" became the build-priority signal: Would You Rather shipped same-day
> because the classics sweep and the competitor-review sweep both flagged it
> independently (2026-07-27).

## SwiftUI verification

SwiftUI state bugs are notoriously easy to write and hard to see in a diff. Two
incidents produced the concrete instructions the verifier subagent now carries.

> [!FIELD] 2026-07-21 — The zombie timer
> **What happened.** Opposites sometimes double-buzzed after time ran out — the
> countdown's explode event fired twice on some rounds.
>
> **Why it happened.** The view model started a `Timer.scheduledTimer` in `init()`.
> SwiftUI is allowed to construct a `@State` object more than once while keeping
> only one — the discarded copies' timers keep running and keep firing. And
> `tick()` had no phase guard, so a stale tick from a zombie timer could resolve an
> already-resolved round a second time.
>
> **What changed.** Rewritten as a `@MainActor` async countdown started from the
> view's `.task` (never `init`), cancelled in `.onDisappear`, with `phase`
> re-checked both in the loop and in `expire()` so a round can only resolve once.
> The verifier's checklist item is now mechanical: grep any SwiftUI diff for
> timers, `Task`s, or subscriptions started in `init()` on
> `@State`/`@StateObject`/`@Observable` types, and confirm every state-resolving
> callback carries a phase or idempotency guard.

> [!FIELD] 2026-07-23 — Screenshots prove layout, not transitions
> **What happened.** One hands-on open of the wheel surfaced three bugs the
> build-green-plus-screenshot loop had passed: a debug launch arg re-fired on every
> re-visit, every editor control was permanently dead after the first spin, and
> leftover seeded debug data was riding the real store.
>
> **Why it happened.** `simctl` can't tap, so Simulator verification sees one
> moment, never a second interaction. The launch arg was re-checked on every
> `onAppear`, but launch args persist for the whole process lifetime. The editor
> was `.disabled(phase != .idle)` and the phase parked in `.result` forever. All
> three are invisible by construction to a single-screenshot check.
>
> **What changed.** Debug launch args became one-shot latches, consumed once. And
> the verifier's job for any `.disabled(phase == X)` gate is to trace whether that
> phase can ever return to its start state — not to confirm the first screenshot
> looks right.

The substitute for both telemetry and a tap-through harness was a family of debug
launch arguments, which is worth stealing wholesale.

> [!PATTERN] One-shot DEBUG launch args as the test harness
> Each game ships a DEBUG-only launch argument that jumps straight to a deep state
> for screenshotting: `-openGame`, `-debugUnlockAll YES`, `-wyrPhase
> card|voting|reveal`, `-rouletteAutoSpin`, `-openPartyMode play:finger-roulette`.
> All follow the same latch shape — consumed once, purely in-memory, nothing to
> clean up — so a verifier can reach "mid-spin, ball orbiting, call locked" on
> demand instead of only ever seeing a cold start. The discipline that makes it
> honest: every milestone's log entry splits what the DEBUG-arg Simulator pass
> confirmed from what still needs a real device (haptics, CoreMotion, multi-touch
> timing). Keeping that split every single milestone is what substitutes for
> telemetry.

One harness bug earns its own note, because it's the failure mode of the whole
approach.

> [!FIELD] 2026-07-22 — A harness that hand-stuffs the end state verifies nothing
> **What happened.** The end-of-night summary card's "Drank the most" stat only
> ever appeared under the debug summary path. In a real night the tally was always
> empty — nothing in the app actually called `recordDrinks`.
>
> **Why it happened.** The debug path (`-openPartyMode summary`) fabricated a
> plausible session directly, bypassing the recording code entirely. It passed
> every screenshot check while the production write path was never exercised: it
> looked verified and wasn't.
>
> **What changed.** The debug path now plays a real 14-round night through the real
> `recordDrink` call, and the result is read back off the Simulator's actual disk
> (`drink-log.json`) to confirm it landed. The rule for any verifier or debug
> harness: it must drive the production mutation path, never synthesize the end
> state that path is supposed to produce.

## Naming and the bundle split

The App Store listing is "Ganbei: Party Games" while the bundle display name is
"Ganbei". No agent ever conflated the two on this project — and the interesting part
is why not.

> [!FIELD] 2026-07-21 — A tripwire instead of a one-time fix
> **What happened.** Both names were locked as distinct values in the same commit
> that set the bundle ID, and `project.yml`'s `INFOPLIST_KEY_CFBundleDisplayName`
> was verified to pick up the short form at the time. The project then refused to
> trust that once-correct state to hold.
>
> **Why it happened.** The two names are easy to conflate later: one config key,
> one App Store Connect field, both plausibly "the app name." The risk isn't a bug
> to fix once; it's an ambiguity that recurs every time a fresh session touches
> either surface.
>
> **What changed.** "Confirm `CFBundleDisplayName` ("Ganbei") vs. App Store name
> ("Ganbei: Party Games") is intentional" became a standing line in the
> pre-submission checklist — re-verified at a different point in the project than
> where the names were set. Any project with a split listing/bundle identity should
> carry the same tripwire in `CLAUDE.md`.

## Open slots

Each of these is a question the next project will ask. Answer them here as they come
up, in field-note callouts, with dates.

**Creator seeding.** Promo-code distribution to creators is a repeatable process, not
a one-off. If it turns into a skill, note the shape of it here.

**Purchase path guardrails.** The `PreToolUse` matcher slot in the constraints
section above is still open — the hook exists as a general git guardrail, but the
StoreKit-file-specific matcher hasn't been written down.

> [!FIELD] Template
> **What happened.** One or two sentences.
>
> **Why it happened.** The mechanism, not the blame.
>
> **What changed.** The hook, instruction, subagent, or habit that now prevents it.
>
> Dated, always. A field note without a date is a rumour.

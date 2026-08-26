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
IAP unlock in the $2.99–3.99 range.

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

## Slots to fill

Each of these is a question the next project will ask. Answer them here as they come
up, in field-note callouts, with dates.

**Per-game specs.** Ten-plus games means ten-plus small, self-contained
specifications. Did a shared spec format make agent-written game modes more
consistent? What did the format look like?

**SwiftUI verification.** SwiftUI state bugs are notoriously easy to write and hard
to see in a diff. What did the verifier subagent need to be told to catch them?

**Naming and the bundle split.** The App Store listing is "Ganbei: Party Games" while
the bundle display name is "Ganbei". Any place where an agent conflated the two is
worth recording — it's exactly the kind of detail that belongs in `CLAUDE.md` rather
than being re-explained per session.

**Creator seeding.** Promo-code distribution to creators is a repeatable process, not
a one-off. If it turns into a skill, note the shape of it here.

> [!FIELD] Template
> **What happened.** One or two sentences.
>
> **Why it happened.** The mechanism, not the blame.
>
> **What changed.** The hook, instruction, subagent, or habit that now prevents it.
>
> Dated, always. A field note without a date is a rumour.

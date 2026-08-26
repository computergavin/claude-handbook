---
title: The operating model
status: stable
verified: 2026-08-26
---

Everything else in this handbook is downstream of one idea: **context is a budget,
not a container.**

The instinct is to treat the context window as a room you keep putting things in
until it's full. The useful model is closer to a bank account. Every file read,
every stack trace, every abandoned approach is a withdrawal, and the balance buys
attention. A session that has burned its budget on exploration has less left for
the work, even though nothing has technically overflowed.

That reframing explains most of the advanced features. Subagents exist to spend
someone else's budget. Hooks exist so rules don't have to be paid for repeatedly in
tokens. Compaction is what happens when the account is overdrawn, and it costs you
detail you chose badly.

## The four layers

| Layer | Mechanism | Guarantee |
|---|---|---|
| Instructions | `CLAUDE.md`, rules files | Advisory — followed most of the time |
| Skills | invokable procedures | Advisory, loaded on demand |
| Subagents | isolated context windows | Isolation, not enforcement |
| Hooks | lifecycle shell commands | Deterministic — always runs |

The single most common mistake is putting a requirement in the wrong layer. A
coding preference belongs in instructions. "Never force-push to main" belongs in a
hook, because instructions are a request and hooks are a control.

> [!PATTERN] The layer test
> Ask: what happens the one time the model doesn't follow this? If the answer is
> "nothing much," it's an instruction. If the answer is "I lose work," it's a hook.

## Three failure modes worth naming

**Context pollution.** Failed approaches don't leave the window when they stop being
relevant. Twenty minutes into a bad debugging path, the session is reasoning against
a transcript full of things that didn't work, and it will keep proposing neighbours
of those things. The fix is isolation — a fresh subagent, or `/clear` and a written
handoff — not a better prompt.

**Anchoring.** The first hypothesis explored biases everything after it. Sequential
investigation is structurally prone to this, which is why parallel adversarial
investigation is the strongest debugging technique in the handbook (see the agent
teams chapter).

**Silent staleness.** Instructions loaded at session start drift out of relevance as
the work moves, and compaction can quietly drop them. Re-injection on compaction
fixes this and almost nobody sets it up.

## The default posture

Plan in the main session. Explore in subagents. Enforce in hooks. Reserve the main
context for decisions and their reasoning, and push anything that produces volume —
test output, codebase searches, log analysis — somewhere it can be summarised before
it comes back.

> [!CAUTION] Cost is real
> Every layer of delegation multiplies token spend. Isolation is worth paying for
> when the alternative is a polluted main window; it is not worth paying for on a
> task that fits comfortably in one session.

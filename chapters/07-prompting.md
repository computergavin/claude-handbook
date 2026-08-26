---
title: Prompting
status: stub
verified: 2026-08-26
---

Techniques that hold up across models and surfaces.

## Structure

Clear and detailed beats clever. Positive and negative examples. Explicit XML tags
when you need parseable structure. Say what format and roughly what length you want.

*To capture:* your own reusable prompt skeletons.

## Specification over instruction

The recurring lesson: describe the goal and the acceptance criteria, not the steps.
Step-by-step instructions transfer your assumptions along with your intent, and the
model can't tell which parts were load-bearing.

*To capture:* concrete before/after pairs from real sessions.

## Delegation prompts

Different discipline from conversational prompting — a subagent needs goal, return
contract, and boundary, because it has no shared history to fall back on.

*To capture:* your standard delegation preamble.

## Anti-patterns

*To capture:* the phrasings that reliably produced bad output, with the fix.

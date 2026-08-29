---
title: Prompting
status: draft
verified: 2026-08-26
sources:
  - https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
  - https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
  - https://platform.claude.com/docs/en/build-with-claude/thinking
  - https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost
---

Prompt structure has measurable effects on output quality. What goes where, in
what order, and which examples back it all change the result. A prompt that
matters belongs in version control like any other artifact. These are the techniques that hold up across models
and surfaces.

Anthropic consolidated its per-technique docs (XML tags, long-context tips, extended
thinking tips) into one living page, [Prompting best
practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices);
the old URLs redirect there. Everything below is verified against that page and the
thinking docs as of the date above.

## Structure

Clear and detailed beats clever. Positive and negative examples. Explicit XML tags
when you need parseable structure. Say what format and roughly what length you want.

The docs' golden rule: show your prompt to a colleague with minimal context and ask
them to follow it. If they'd be confused, Claude will be too.

Motivation is part of the instruction. "Never use ellipses" underperforms "your
response will be read aloud by a text-to-speech engine, so never use ellipses" —
Claude generalizes from the explanation, so it also avoids the adjacent mistakes you
didn't enumerate.

XML tags are Anthropic's documented preference for separating instructions, context,
examples, and variable input: wrap each kind of content in its own tag
(`<instructions>`, `<context>`, `<input>`), keep tag names consistent across your
prompts, and nest when content has a real hierarchy. There is no canonical tag
vocabulary — consistency within your own prompts is what matters. The same trick
steers output: "write the prose sections in `<report>` tags" beats "do not use
markdown", because positive instructions outperform prohibitions.

Prompt style bleeds into output style: stripping markdown from the prompt reduces
markdown in the response. Match the prompt's register to the output you want.

## Placement and ordering

Role and durable behavior go in the `system` prompt; the task goes in the user turn.
For long inputs the ordering inside the user turn matters more than most people
expect: put documents and data at the top, query and instructions at the bottom.
Anthropic reports that with 20k+ token inputs, placing the query at the end improves
response quality by up to 30% in its tests, especially for multi-document inputs.

Wrap each document in `<document>` tags with `<source>` and `<document_content>`
subtags so Claude can cite and distinguish them.

> [!PATTERN] Quote-first grounding
> For long-document tasks, ask Claude to extract relevant quotes into `<quotes>` tags
> *before* doing the actual task, then work from the quotes. This focuses attention on
> the relevant spans and makes the answer auditable — you can check the quotes against
> the source. Two extra lines of prompt, and it's the single cheapest hallucination
> reducer for retrieval-style work. See the Retrieval chapter.

Placement also interacts with prompt caching: stable content (system prompt, documents)
first, volatile content (the question) last, so the prefix caches. The Cost and Latency
chapter covers the mechanics.

## Few-shot examples

Examples are the single most effective move for output format, tone, and structure —
the docs call them "one of the most reliable ways to steer Claude's output." Use 3–5,
wrapped in `<example>` tags (multiple inside `<examples>`), and make them relevant to
your actual inputs and diverse across edge cases.

They backfire in two ways. First, Claude pattern-matches on everything in the example,
not just the part you intended — if all five examples happen to be short, or all
positive-sentiment, or all in one domain, that accidental regularity becomes an
instruction. Diversity across examples is the defense. Second, examples pin format at
the cost of reasoning: for open-ended analysis, a rigid example set narrows the answer
space. Use examples for format-critical tasks; use specification for judgment tasks.

A cheap meta-move from the docs: paste your examples in and ask Claude to evaluate
them for relevance and diversity, or to generate more from your initial set.

## Specification over instruction

The recurring lesson: describe the goal and the acceptance criteria, not the steps.
Step-by-step instructions transfer your assumptions along with your intent, and the
model can't tell which parts were load-bearing.

The docs now say this explicitly for reasoning: "prefer general instructions over
prescriptive steps" — "think thoroughly" often beats a hand-written plan, because
Claude's own decomposition frequently exceeds what you would prescribe.

> [!CAUTION] Prompts tuned for old models overtrigger on new ones
> Aggressive phrasing such as "CRITICAL: You MUST use this tool when..." fixed
> undertriggering on earlier models, but per the docs it causes overtriggering
> on Claude Opus 4.5 and Opus 4.6. Dial back to plain "Use this tool when...". The
> self-check instruction ("verify your work before finishing") runs the other
> direction and is model-specific in the opposite sense: the docs still recommend it
> for most models, but call out Claude Opus 5 as the one exception that self-checks
> unprompted, where carrying the instruction over just adds tokens and latency. Check
> which way a new model moved before touching either instruction — don't assume
> "current models" as a class behave like either extreme.

> [!FIELD] Specify the next measurement, not the next theory — 2026-08-28
> **What happened.** A cover animation froze for a second, on one machine only,
> on the first run after load only. A day of sessions prompted as "figure out
> the lag" produced three confident diagnoses — GC, pixel-grid quantization,
> 120Hz frame doubling — all plausible, all wrong, none tested on the machine
> that showed the bug. The session that closed it was constrained differently:
> the handoff listed the dead theories, pinned the next step to one measurement
> with a named output (a `FRAMES` line of real rAF gaps), and handed the agent
> the failing environment itself — browser control of the affected Chrome
> profile rather than a description of the symptom. Four falsifiable questions
> later the bug was found in an hour, and it was never in the code: a security
> extension's one-time DOM sweep blocked the main thread for 900ms.
>
> **Why.** "Figure out the lag" has no acceptance criterion, so the model
> satisfies it the cheapest way available: a coherent theory. Theories are
> cheap to produce and expensive to disprove, and a session that cannot reach
> the failing environment can do nothing but theorize. Naming the required
> output inverts the economics — every step has to produce a number that can
> kill it. The human stays in the loop only for what the tools cannot do:
> watching the run, the incognito check, the extension bisect.
>
> **What changed.** Debugging handoffs here now carry three things: the
> theories already disproven, so they are not relitigated; the single next
> measurement and the exact output it must produce; and access to the
> environment that shows the bug, not a secondhand account of it.

## Prefilling is dead — migrate

Prefilling the assistant turn (starting Claude's reply with `{` to force JSON, or
"Here is the summary:" to kill preambles) was the classic format-control trick.
Starting with the Claude 4.6 family, a prefilled last assistant turn returns a 400
error. The replacements, per the migration guidance:

- **Format control** → structured outputs (`output_config.format`), or just ask —
  current models match complex schemas reliably. See the Structured Output chapter.
- **Preamble suppression** → system-prompt instruction ("respond directly without
  preamble"), XML output tags, or strip in post-processing.
- **Continuations** → move to the user turn: "Your previous response was interrupted
  and ended with `[text]`. Continue from where you left off."

Assistant messages elsewhere in the history are still fine; only the trailing prefill
is rejected.

## Thinking: when it pays and how to budget it

Keep two distinct things separate:

**Chain-of-thought prompting** is you asking for reasoning in the visible output —
"think step by step in `<thinking>` tags, then answer in `<answer>` tags." It needs no
API parameter and remains the fallback when thinking is off. You can also put
`<thinking>` sections inside few-shot examples to demonstrate a reasoning pattern;
Claude generalizes the style into its own thinking.

**Thinking as an API feature** is a separate pre-response channel, billed as output
tokens. The old form, extended thinking with a manual `budget_tokens`, is legacy. It is
deprecated on 4.6 models and returns a 400 error on 4.7 and later. Current models use *adaptive*
thinking (`thinking: {"type": "adaptive"}`), where Claude decides per request whether
and how deeply to think, and you steer with `output_config.effort` (`low` through
`max`; default `high`). Anthropic's internal evaluations found adaptive thinking
reliably outperforms fixed-budget extended thinking.

It pays for math, debugging, multi-step analysis, and long agentic loops — tasks
where the answer depends on intermediate work. It is wasted on extraction,
classification, and formatting: lower the effort there, or steer per message. The
documented per-message steering phrases are underused. Append "Please think hard
before responding." to a planning step and "Answer directly without
deliberating." to a routine one. An agent harness can switch per turn without
touching any parameter.

There is no thinking budget to set anymore. `max_tokens` is the hard cap on thinking
plus response combined; `effort` is soft guidance on the split. If you hit
`stop_reason: "max_tokens"`, raise the cap when the truncated requests needed the
reasoning, and lower the effort when they didn't.

> [!CAUTION] Thinking bills invisibly, and effort changes break the cache
> With `display: "omitted"` (the default on the newest models) you see no reasoning
> text but pay for every thinking token — check
> `usage.output_tokens_details.thinking_tokens`. And the resolved effort value is
> rendered into the prompt, so changing `effort` mid-conversation invalidates your
> prompt cache breakpoints — the same way changing the legacy `budget_tokens`
> parameter does on models that still accept it. Pick a level per
> conversation and hold it; steer per message instead.

## Meta-prompting

Use the model to improve the prompt. Three levels:

1. **Generate a first draft** with the metaprompt recipe in Anthropic's cookbook
   (linked from the prompt-engineering overview docs) when you're starting cold.
2. **Critique in place**: paste the prompt and its failure cases into a session and
   ask for the minimal edit that fixes the failures without touching what works.
   Failure cases are the important half — "improve this prompt" without them produces
   generic padding.
3. **The Console prompt improver** (Anthropic Console → Workbench). Per [Anthropic's
   announcement](https://claude.com/blog/prompt-improver) — vendor-reported, treat as
   a lead, not a doc fact — it rewrites the prompt, adds a chain-of-thought section, and
   standardizes examples into XML. In Anthropic's test it lifted multilabel
   classification accuracy by 30%. Audit its output before shipping: the
   announcement still lists prefill addition as one of the improver's steps
   (re-checked, page last
   updated mid-2026), and a generated prefill now targets a feature current models
   reject with a 400.

## Prompts as versioned artifacts

A prompt that earns its keep is a file, not a string literal: checked in, diffed in
review, deployed like code. This buys three things.

- **Diffs.** Most prompt regressions come from a well-intentioned wording
  tweak, and a one-line diff is findable where an edited string in a dashboard
  is not.
- **Byte-stability.** Identical files produce identical cache prefixes (see
  the Cost and Latency chapter).
- **Regression testing.** The docs' own instruction for prompt-based steering
  is "measure before you ship": run a representative sample with and without
  the change. The Evals chapter covers that harness. The discipline is that no
  prompt edit merges without a run against the fixtures.

*To capture:* your own reusable prompt skeletons, and before/after pairs from real
sessions.

## Delegation prompts

Delegation is a different discipline from conversational prompting. A subagent
has no shared history to fall back on, so it needs a goal, a return contract,
and a boundary. The Subagents chapter covers the mechanics. The prompt shape is
what done looks like, what to return and in what format, and what not to touch.

*To capture:* your standard delegation preamble, and the phrasings that reliably
produced bad output, with the fix.

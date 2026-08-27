---
title: Structured output
status: draft
verified: 2026-08-26
sources:
  - https://platform.claude.com/docs/en/build-with-claude/structured-outputs
  - https://developers.openai.com/api/docs/guides/structured-outputs
  - https://arxiv.org/abs/2408.02442
---

Extraction pipelines live or die on three decisions: which mechanism actually
guarantees your schema (most merely encourage it), whether the schema lets the
model decline instead of hallucinate, and whether the format constraint is
quietly making the model dumber. This chapter is those three decisions, in
order.

Half your projects are this shape — leads out of scraped pages, line items out
of receipts and quotes, classification at volume. Every one of them is the same
pipeline: messy input, a schema, and a loop.

## What guarantees the schema and what merely encourages it

There are four mechanisms, and they form a ladder of increasing guarantee:

1. **Prompting for JSON.** "Respond with JSON matching this shape." Zero
   guarantee. Fine for a one-off script, disqualifying for a pipeline.
2. **Tool schemas without strict mode.** Defining a tool and forcing it with
   `tool_choice` gets you JSON in the right neighborhood, but the input is not
   validated against the schema. It usually conforms. "Usually" times ten
   thousand receipts is a nightly pager.
3. **Strict tool use.** On the Claude API, `strict: true` as a top-level field
   on the tool definition guarantees the tool input validates against the
   schema. It requires `additionalProperties: false` and a `required` array.
4. **Native structured output.** `output_config: {format: {type: "json_schema",
   schema: {...}}}` on `messages.create()` — the older `output_format`
   parameter is deprecated. The API compiles your schema to a grammar and
   constrains decoding: the response cannot fail `json.loads`, cannot omit a
   required field, cannot invent one. OpenAI's equivalent is Structured Outputs
   (as distinct from JSON mode, which only guarantees *valid JSON*, not *your
   JSON* — their docs tell you to prefer Structured Outputs whenever possible).

For extraction pipelines, use mechanism 4 and let the SDK do the validation:
`client.messages.parse()` with a Pydantic model gives you a typed object back,
not a dict you re-validate by hand.

The guarantee has boundaries. Constrained output still goes off-schema when
`stop_reason` is `refusal`, and truncates when it is `max_tokens` — check both
before parsing. And not all of JSON Schema survives compilation: recursion,
`minimum`/`maximum`, and `minLength`/`maxLength` are unsupported and return a
400 if you send them raw. The Python and TypeScript SDKs strip those
constraints from what they send and validate them client-side instead, so
`parse()` can raise a validation error on a response the API considered
conformant. That is the seam the repair loop below exists for.

> [!NOTE] Schema-valid is not true
> Constrained decoding guarantees shape, never content. The model can emit a
> perfectly conformant `{"total": 847.20}` for a receipt that says $84.72.
> Everything downstream of the mechanism choice — descriptions, nulls,
> evidence fields — is about content quality, which no grammar can enforce.

## The schema is a prompt

The schema is not plumbing that happens after prompting — it is roughly half
the prompt, and it deserves the same drafting effort.

**Field descriptions carry instructions.** A `description` on a schema
property lands in the model's context. `"total_cents": {"type": "integer",
"description": "Grand total in cents, after tax and tip. Use the printed
total, never sum the line items yourself."}` does more work than the same
sentence buried in a system prompt three screens from the field it governs.

**Enums beat free text.** `"category": {"enum": ["materials", "labor",
"permit", "equipment_rental", "other"]}` closes the output space; a free-text
category gives you forty spellings of the same five ideas and a normalization
layer you now maintain forever. The "Let Me Speak Freely?" paper (below) found
classification *improves* under format constraint — the authors attribute it
to exactly this narrowing of the answer space. Volume classification is the
one workload where the schema helps twice.

**Field order is generation order.** The model writes the JSON top to bottom,
so a field's value can only condition on fields above it. Put `currency`
before `total_cents`, `evidence_quote` before `value`, and any reasoning
field first. This is not a style preference. The paper traced a concrete
failure to it: 100% of GPT-3.5 Turbo's JSON-mode responses on a reasoning
task emitted the `answer` key before the `reason` key, which silently
converted chain-of-thought into direct answering.

## Let the model decline

A schema where every field is a bare `string` is an instruction to
hallucinate: the grammar *forces* a value even when the page contains none.
Scraped lead pages are mostly holes. A typical page has no phone, no title,
and half an address, so the schema must make "absent" expressible:

```json
"phone": {
  "anyOf": [{"type": "string"}, {"type": "null"}],
  "description": "Phone number exactly as written on the page. null if no phone number appears. Never construct or complete one."
}
```

OpenAI's docs make the same demand from the other direction. Every field must
be `required`, and optionality is expressed as a union with `null`. Your
prompt should also say explicitly what to do "where the input cannot result
in a valid response," because a model given no escape hatch fills the field
anyway. Pair each hard-to-verify field with an `evidence` field (ordered
before it) holding the verbatim source text; a null evidence field with a
non-null value is a hallucination you can catch mechanically.

## Validate and repair, once

> [!PATTERN] The one-retry repair loop
> Validate every response against the *full* schema — including the
> constraints the SDK stripped. On failure, retry exactly once, appending the
> model's response and a user turn containing the validator's actual error
> message ("total_cents: -450 fails minimum: 0"). On second failure, dead-letter
> the record for human review. This is the standard practitioner pattern
> (OpenAI's docs gesture at it as "adjusting your instructions" on mistakes);
> the specific discipline of one retry with the machine-generated error, then
> quarantine, is what keeps it cheap.

The loop costs nothing on the happy path and one extra call on the sad path.
Resist the urge to loop more than once: a model that failed twice on the same
record is telling you the input is pathological or the schema is wrong, and
five retries at volume is a cost multiplier hiding in your error handler.
With constrained decoding the loop rarely fires for shape — it fires for
client-side constraints and for semantic checks you bolt on (line items that
don't sum, dates in the future), which are exactly the failures worth a
worded retry.

## When the constraint makes the model dumber

Format constraints are not free. Tam et al., "Let Me Speak Freely?"
(arXiv:2408.02442) measured reasoning tasks under free-form text, format
instructions in the prompt, and constrained JSON mode, and found a consistent
hierarchy: free text ≥ two-step conversion ≥ format instructions ≥ JSON mode.
On GSM8K, Claude 3 Haiku fell from 86.51% free-form to 23.44% under
schema-constrained JSON; GPT-3.5 Turbo from 75.99% to 49.25%. Parsing errors
are not the cause: on the paper's Last Letter Concatenation task, LLaMA 3 8B
had a 0.148% JSON parse-failure rate and still showed a 38-point accuracy gap
between free-form and constrained. The constraint degrades the reasoning
itself, not the parsing.

> [!CAUTION] Constrained decoding taxes reasoning
> The harder the task leans on multi-step reasoning, the more the grammar
> costs you in accuracy — while pure classification actually improves under
> the same constraint. Match the mechanism to the task: full constraint for
> classification and simple extraction, the two-step pattern when the answer
> requires judgment. (The numbers above come from 2024 models. Keep the
> direction, not the magnitudes.)

> [!PATTERN] Reason-then-extract
> Two calls. The first is free-form with no schema: "read this quote request
> and work out the correct line items, flag anything ambiguous." The second is
> constrained: extract the first call's prose into the schema, a task so
> mechanical the format tax is negligible. This is the paper's "NL-to-Format" condition,
> which recovered most of the free-form accuracy. The extract step is also a
> natural place to drop to a cheaper model: reasoning on the strong model,
> schema-filling on Haiku. On current Claude models, adaptive thinking gives
> you reasoning space before the constrained JSON in a single call. That is a
> real mitigation, but for judgment-heavy extraction the explicit two-step
> keeps the reasoning inspectable and the failure modes separable.

## Extraction at volume

The per-record habits above are table stakes; volume adds four more.

**Preprocess the HTML.** Scraped pages are 90% nav, script, and footer.
Strip to text or markdown before the model sees it. Otherwise you are paying
input tokens for `<div class="cookie-banner">`, and burying the three facts
you want in boilerplate hurts recall. There is no controlled number for that
claim, so treat it as a hypothesis to check against your own extraction
accuracy. A
dumb readability-extraction pass is the highest-ROI line in the pipeline.

**Freeze the schema for the run.** Compiled grammars are cached for 24 hours
from last use; the first request with a new schema eats the compilation
latency. The cache is keyed on schema structure and the tool set, so editing
only a `name` or `description` does *not* invalidate it. Separately, changing
`output_config.format` mid-conversation invalidates the prompt cache.
Structured output also injects an explanatory system prompt, so budget for
slightly more input tokens than a bare request would use.

**Batch what isn't interactive.** Overnight extraction belongs on the
Batches API at 50% of interactive pricing; structured outputs work with
batches, streaming, and token counting, but not citations (400 error).

**Right-size the model.** Enum classification at volume is Haiku work.
Judgment-heavy extraction is where the two-step pattern earns the strong
model's rate on only the first call.

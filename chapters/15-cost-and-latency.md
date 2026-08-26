---
title: Cost and latency
status: draft
verified: 2026-08-26
sources:
  - https://platform.claude.com/docs/en/models/overview
  - https://platform.claude.com/docs/en/build-with-claude/prompt-caching
  - https://platform.claude.com/docs/en/build-with-claude/batch-processing
  - https://platform.claude.com/docs/en/build-with-claude/streaming
  - https://developers.openai.com/api/docs/guides/prompt-caching
  - https://developers.openai.com/api/docs/guides/batch
---

Cost and latency are design inputs, not bills you discover later: three structural
decisions — stable prefix first, async where nobody is waiting, cheap model first —
routinely cut spend 5–10x without touching quality.

You already do the manual version of this when you route grunt work to cheaper
subagent models to stretch Claude Code quota. This chapter is the systematic
version for the API.

## The price sheet

Verified against the models overview, 2026-08-26. Prices are per million tokens.

| Model | Input | Output |
|---|---:|---:|
| Claude Fable 5 | $10 | $50 |
| Claude Opus 5 | $5 | $25 |
| Claude Sonnet 5 | $2 | $10 |
| Claude Haiku 4.5 | $1 | $5 |

Two ratios drive everything below. Output costs **5x input** on every current
model, so verbosity is the most expensive habit you have. And the model tiers
span **10x** ($1 to $10 input), so routing is the biggest single lever.

## Prompt caching: the economics

Cache reads cost **0.1x** the base input price. Cache writes cost **1.25x** for
the default 5-minute TTL and **2x** for the 1-hour TTL. On Opus 5 that is
$6.25/MTok to write (5m), $10/MTok to write (1h), and $0.50/MTok to read.

The break-even is fast. With the 5-minute TTL, a prefix read once after writing
already wins: 1.25x + 0.1x = 1.35x versus 2x uncached. The 1-hour TTL needs three
uses to beat no-cache and exists for traffic with gaps longer than five minutes —
batch jobs, hourly crons, a support inbox.

Three TTL behaviors the docs state and most people miss:

- **Reads refresh the TTL for free.** "The cache is refreshed for no additional
  cost each time the cached content is used." Steady traffic under one request per
  five minutes keeps a 5-minute cache alive indefinitely at read prices.
- **The clock starts at request start, not response end.** If a response streams
  for 4 minutes, the next request on that prefix must start within about 1 minute
  of it finishing. Long agentic turns eat their own cache lifetime.
- **Short prefixes silently don't cache.** The minimum is model-dependent and not
  monotonic across generations: 512 tokens on Opus 5 and Fable 5, 1,024 on
  Sonnet 5, **4,096 on Haiku 4.5**. Below the minimum there is no error — just
  `cache_creation_input_tokens: 0`.

> [!CAUTION] Haiku's 4,096-token cache floor
> The model you route bulk work to has the highest cache minimum. A 2,000-token
> shared rubric caches on Opus 5 and does nothing on Haiku 4.5, silently. Either
> pad the shared prefix past 4,096 tokens or price Haiku work uncached.

Verify with the response `usage` block: `cache_read_input_tokens` at zero across
repeated identical requests means a silent invalidator — a timestamp in the system
prompt, unsorted JSON serialization, a tool set that varies per user.

## Ordering is the design constraint

Caching is a prefix match: one changed byte invalidates everything after it, and
the API renders requests in a fixed order — `tools`, then `system`, then
`messages`. That mechanical fact dictates prompt architecture:

> [!PATTERN] Frozen prefix, moving suffix
> Sort every input to the prompt by how often it changes, and render in that
> order: tool definitions and system prompt byte-identical across all requests,
> per-session context next, the per-request payload (the lead, the document, the
> question) dead last, after the final `cache_control` breakpoint. Never
> interpolate the date, a user ID, or a mode flag into the system prompt — put
> dynamic context in a message instead.

This is why a fixed system prompt plus moving user content beats interleaving
instructions with data. "Here are the rules, here is lead #4,712" reuses the
rules at 0.1x on every call; a prompt that weaves per-lead facts into the
instructions re-buys the instructions 10,000 times. Same tokens, 10x the input
bill.

Two more mechanics from the caching doc worth knowing before they bite:

- **Breakpoint placement:** you get at most 4 `cache_control` breakpoints. Put
  one on the *last block that is identical across requests* — a breakpoint on the
  final (varying) block writes 10,000 distinct entries and reads none.
- **The 20-block lookback:** each breakpoint searches at most 20 content blocks
  backward for a prior cache entry. Agentic turns that append dozens of
  tool_use/tool_result blocks can push the breakpoint out of range and silently
  miss; add an intermediate breakpoint.

Two lesser-known techniques, both from the prompt-caching doc: **pre-warm** by
sending a `max_tokens: 0` request at startup — the API writes the cache at your
breakpoint, returns empty content, bills no output — so the first real user never
pays cold-prefix latency. And for **parallel fan-out**, a cache entry becomes
readable only once the first response begins; N simultaneous identical-prefix
requests all pay full write price. Send one, await the first streamed token, then
fire the other N−1 into the warm cache.

## Batches: 50% off for patience

The Message Batches API charges **50% of standard prices on all usage** — input,
output, and cache tokens alike. Limits: 100,000 requests or 256 MB per batch,
results within 24 hours ("most batches finishing in less than 1 hour"), results
downloadable for 29 days.

Batchable work is anything with no human waiting: evals, backfills,
classification runs, nightly summarization, report generation. The discounts
stack with caching — but batch requests process concurrently in any order, so
cache hits are best-effort ("30% to 98%, depending on traffic patterns"), and the
docs recommend the 1-hour TTL for shared batch context since processing routinely
exceeds five minutes. (`max_tokens: 0` pre-warming is rejected inside a batch.)

## Routing: the 10k-lead worked example

Classify 10,000 scraped leads. Each request: a 2,000-token shared rubric plus
~1,500 tokens of scraped page text, returning ~50 tokens of JSON. Totals: 35M
input tokens, 0.5M output tokens.

**Naive** — Opus 5, synchronous, no cache:
35M × $5 + 0.5M × $25 = $175.00 + $12.50 = **$187.50**.

**Engineered** — Haiku 4.5 first with a `confidence` field in the output schema;
escalate the ~15% of leads below threshold to Opus 5; everything batched:

- Haiku pass, all 10k: 35M × $1 + 0.5M × $5 = $37.50 → batch 50% → **$18.75**
- Opus escalation, 1,500 leads: 5.25M × $5 + 0.075M × $25 = $28.13 → **$14.06**
- Total: **$32.81** — 5.7x cheaper, same Opus judgment on every hard case.
  Escalating to Sonnet 5 instead lands at ~$24.

The cascade pattern (cheap model first, escalate on confidence failure) appears
throughout practitioner writing on LLM cost; the numbers above are computed from
the verified price sheet, not borrowed. Make the escalation trigger mechanical: a
self-reported confidence enum, a failed schema validation, or disagreement
between two cheap-model samples. Never "the answer looks short."

## Output discipline

At 5x input price, output tokens are where prose costs real money. Concrete
moves: demand a JSON schema with terse enum values instead of sentences
(`"tier": "B"` beats "This lead appears to be of moderate quality because...");
set `max_tokens` to the actual ceiling of the schema for classification-shaped
work; instruct "no preamble, no restatement of the input." A 50-token schema
versus a 300-token prose answer is a 6x difference on the expensive meter, at
identical decision quality.

## Streaming buys perceived latency

Streaming changes when tokens arrive, not what they cost. For anything a human
watches, time-to-first-token is the latency that matters, and a cached prefix
improves it directly — the model skips re-processing the prefix. One mechanical
note from the streaming doc: the SDKs require streaming for large `max_tokens`
values to avoid HTTP timeouts (use `stream()` + `get_final_message()` when you
don't need the deltas). Follows from the same logic, but not itself a doc claim:
background jobs have no one watching for a first token, so batch those instead
of streaming them.

> [!NOTE] OpenAI has converged on the same design
> As of GPT-5.6, OpenAI prompt caching matches Anthropic's economics almost
> exactly: 1.25x cache writes, 0.1x reads, explicit breakpoints, 1,024-token
> minimum, 30-minute TTL (their earlier models: implicit caching, no write
> charge). Their Batch API is likewise 50% off with a 24-hour window. The
> structural rule — stable prefix first, volatile content last — is now
> vendor-neutral architecture, not an Anthropic quirk.

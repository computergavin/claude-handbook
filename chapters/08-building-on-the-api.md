---
title: Building on the API
status: draft
verified: 2026-08-26
sources:
  - https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
  - https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
  - https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner
  - https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
  - https://platform.claude.com/docs/en/api/errors
  - https://platform.claude.com/docs/en/build-with-claude/token-counting
  - https://platform.claude.com/docs/en/models/overview
  - https://code.claude.com/docs/en/agent-sdk/overview
---

The API is for the things that outgrow a Claude Code session and become software.

Every agent framework, including Claude Code itself, wraps the same loop: send a
messages array, execute what comes back, append, repeat. Learn the loop first and
every abstraction above it becomes a choice instead of a mystery.

## The loop every framework wraps

The API is stateless. You send the full conversation on every request; the model
returns content blocks and a `stop_reason`. Tool use is three moves:

1. Send `tools` (name, description, `input_schema`) with your messages.
2. Claude answers with `stop_reason: "tool_use"` and one or more `tool_use` blocks,
   each carrying an `id`, `name`, and parsed `input`.
3. Append that assistant message *unmodified* to history, run the tools, and send a
   user message whose content is `tool_result` blocks referencing each `tool_use_id`.
   Loop until the stop reason is `end_turn`.

Two rules the docs enforce and beginners violate: return all parallel tool results in
a **single** user message (splitting them across messages trains Claude out of
parallel calls), and return failures as a `tool_result` with `is_error: true` rather
than dropping them. A dropped result is a protocol violation; an error result is
information Claude adapts to.

`stop_reason` is your control flow, and there are more values than `tool_use`
and `end_turn`. `max_tokens` means the response was truncated, so raise the cap
or continue. `refusal` arrives as an HTTP 200, so check `stop_details` before
reading content. `stop_sequence` and `model_context_window_exceeded` mean what
they say. The odd one is `pause_turn`: a server-tool loop hit its iteration
limit mid-turn. To handle it, send the entire `response.content` back as an
assistant message with no tool results, and the model resumes.

## Four rungs, one decision rule

There are four ways to run this loop, distinguished by who owns the harness. Pick
the lowest rung that carries your requirements — each step up trades control for
scope you no longer maintain.

| Rung | You write | It gives you |
|---|---|---|
| Raw loop | the `while stop_reason == "tool_use"` loop | total control, zero dependencies |
| Tool runner (`client.beta.messages.tool_runner`) | just the tool functions | the loop, schema derivation, type safety |
| Claude Agent SDK (`claude-agent-sdk`) | a prompt and options | Claude Code's harness: built-in file/bash/search tools, context management, permissions, hooks, subagents, sessions |
| Claude Code headless (`claude -p`) | a shell command | everything above plus your installed skills and config |

The rule: **default to the tool runner. Move down only for control flow it
cannot express. Move up only when you want tools you didn't write.** The raw
loop earns its keep when you need a beta-free dependency or a loop shape the
runner's hooks don't fit. The Agent SDK pays for itself the moment your agent
needs to read files, run commands, or manage its own context — reimplementing
Claude Code's harness by hand is weeks of work the SDK ships as
`query(prompt, options)`. The SDK is where you land when a headless `-p` run
stops being enough and you need permission callbacks and session control. Note the SDK is Python and
TypeScript only; from other languages, drive the CLI as a subprocess with `-p
--output-format json`.

The tool runner is less well known than it deserves to be. In Python, decorate a typed,
docstringed function with `@beta_tool` and the SDK derives the JSON schema from the
signature. `runner.until_done()` runs the loop to completion; iterating the runner
instead yields each assistant message, which is where the interesting control lives:

> [!PATTERN] Mid-loop takeover
> The runner is an iterable, and inside the loop you can seize one iteration:
> inspect the pending call, run `generate_tool_call_response()` yourself, and
> `append_messages()` the assistant turn plus your (possibly modified) result. The
> runner skips its automatic append for that iteration. This is how you build
> approval gates, audit logging, and result rewriting (e.g. adding `cache_control`)
> without abandoning the runner for a hand-rolled loop. Pass `max_iterations` to
> bound it. The runner is in beta and supported across all of Anthropic's SDKs.

## Streaming tool calls

Tool inputs stream as `input_json_delta` events carrying `partial_json` string
fragments; the `content_block_start` for the block shows `input: {}` as a
placeholder. Accumulate fragments per block index, parse on `content_block_stop`.
SDK accumulator helpers do this for you.

By default the API buffers and validates each parameter server-side before
streaming it, so a large parameter, such as a whole file or a long document,
shows nothing until it's finished. Set `eager_input_streaming: true` on the tool definition (a
per-tool field, no beta header; it replaces the legacy
`fine-grained-tool-streaming-2025-05-14` header) and fragments arrive as Claude
writes them. That's the difference between a live-updating editor pane and a
frozen spinner.

> [!CAUTION] Eager streaming skips validation
> With `eager_input_streaming` the accumulated input can be invalid or truncated
> JSON — a `max_tokens` stop can cut a parameter mid-string. Guard the parse. When
> it fails, don't run the tool: return the raw string wrapped as
> `{"INVALID_JSON": "<what you received>"}` in a `tool_result` with
> `is_error: true`, and let Claude retry. Build the wrapper with a JSON library,
> not string concatenation.

## Errors, retries, and idempotency

The retryable set: 429 `rate_limit_error`, 500 `api_error`, 529 `overloaded_error`
(platform-wide load, not your fault), plus connection errors and timeouts. The SDKs
already retry these with exponential backoff, twice by default, and they honor
`retry-after`. Write custom retry logic only for behavior beyond that, and catch
typed exception classes most-specific-first rather than string-matching messages.
Log `response._request_id` on every failure; it's what support can act on.

Two 429s are not retryable and look like ones that are. The monthly spend-cap
429 carries no `retry-after` header and fails until access resumes. A sharp
usage ramp can trip acceleration limits, so ramp traffic gradually instead of
retrying harder. A backoff loop pointed at either burns time for nothing.

> [!PATTERN] Idempotency keys come free
> Every `tool_use` block has a unique `id`. For side-effecting tools such as
> sending email, creating an invoice, or pushing a commit, record the
> `tool_use_id` before executing and no-op
> on replay. Crashes mid-loop, resumed sessions, and the model re-calling a tool
> after an ambiguous error all become safe, because the same id never fires the
> side effect twice. Store the original result and return it, so the conversation
> stays consistent.

## Count before you send

`client.messages.count_tokens()` takes the same shape as `messages.create`,
including system, tools, images, and PDFs, and returns `input_tokens`. It's free, with a
separate rate limit (2,000 requests/minute at the lowest tier) that doesn't touch
your message quota. Use it as a pre-flight gate: route small jobs to a cheaper
model, refuse inputs that won't fit, and price work before running it. The count is
an estimate, and models from Opus 4.7 on use a tokenizer that produces roughly
35% more tokens for the same text. The docs' own numbers are ~750k words per 1M
tokens before Opus 4.7 and ~555k on the current tokenizer. Always count against
the model you'll actually call.

## Structured output

When you need JSON, say so unambiguously in the system prompt, strip code fences
defensively, and parse inside a try/catch. Assume a code-fence wrapper will occasionally
appear anyway. The stronger mechanism is the API's structured outputs
(`output_config.format` and `strict: true` on tool schemas) — the Structured Output
chapter covers when each applies.

## Models and cost

Current API IDs: `claude-opus-5` ($5/$25 per MTok in/out), `claude-sonnet-5`
($2/$10), `claude-haiku-4-5` ($1/$5), `claude-fable-5` ($10/$50). Dateless IDs from
the 4.6 generation on are pinned snapshots, not floating aliases — pinning to a
date-suffixed ID is obsolete. Batches API requests run at 50% off;
cache reads at 10% of input price. Verify current model IDs, limits, and pricing
against the docs rather than memory — this is the fastest-moving section in the
handbook. Per-task tier selection and the caching math live in the Cost and Latency
chapter.

*To capture:* where batch processing paid off and the actual cost per unit of work;
the first project where the Agent SDK's complexity paid for itself.

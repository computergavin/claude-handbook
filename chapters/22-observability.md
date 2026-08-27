---
title: Observability
status: draft
verified: 2026-08-26
sources:
  - https://github.com/open-telemetry/semantic-conventions-genai
  - https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-spans.md
  - https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/anthropic.md
  - https://opentelemetry.io/docs/specs/semconv/gen-ai/
  - https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-metrics.md
  - https://code.claude.com/docs/en/monitoring-usage
  - https://docs.claude.com/en/docs/build-with-claude/prompt-caching
  - https://github.com/langfuse/langfuse/blob/main/LICENSE
  - https://www.langchain.com/pricing
  - https://www.braintrust.dev/pricing
---

You cannot improve an LLM system you cannot replay: a trace complete enough to
re-run the request is the raw material for everything in the Evals chapter, and
you either capture it at request time or you never have it.

That asymmetry is the whole argument for instrumenting on day one. Logs of
"request succeeded, 3.2s" tell you nothing when a user reports a bad answer next
Tuesday. The exact prompt that produced it — including the system prompt version,
the retrieved chunks, the tool results mid-conversation — existed for one request
and is gone unless you wrote it down.

## What a trace has to capture

The test is replayability: could you re-issue this exact request tomorrow and
diff the output? That requires, per model call:

- **The full input** — system prompt, message history, tool definitions. Not "the
  user's question"; the assembled thing you actually sent, because that is where
  retrieval bugs, template bugs, and context-truncation bugs live.
- **The full output** — completion text, tool calls with their arguments, and the
  tool *results* fed back in, since an agent's next step is conditioned on them.
- **Model and parameters** — exact model ID, temperature, max_tokens. "The prompt
  didn't change but behaviour did" is usually a model or parameter change.
- **Token counts, from the API, not an estimate.** Every Messages API response
  carries `usage` with `input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, and `cache_read_input_tokens`. Store all four —
  the cache split is how you verify the economics in Cost and latency are
  actually happening.
- **Cost and latency** — compute cost from the usage block at write time, and
  record time-to-first-token separately from total duration for streaming.
- **Correlation IDs** — a session/conversation ID and an anonymised user ID, so
  one bad answer expands into the whole trajectory that produced it.

An agent request is a tree, not a call: one root span for the task, child spans
per model call, per tool execution, per subagent. Flat logs make multi-step
failures unreconstructable — you need the parent-child structure to see that step
4 failed because step 2 retrieved garbage.

## The standard almost nobody knows exists

OpenTelemetry has semantic conventions for exactly this — spans, metrics, and
events for GenAI clients, agents, and MCP — now maintained in their own
repository, `open-telemetry/semantic-conventions-genai`. Status: **Development**,
so attribute names can still change, but they are the only vendor-neutral answer
and the major tools already ingest them.

The attributes map one-to-one onto the list above: `gen_ai.operation.name`,
`gen_ai.provider.name` (set to `"anthropic"` per the Anthropic-specific
conventions), `gen_ai.request.model`, `gen_ai.response.model`,
`gen_ai.request.temperature`, `gen_ai.usage.input_tokens`,
`gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`,
`gen_ai.usage.cache_write.input_tokens`, `gen_ai.conversation.id`. Metrics get
`gen_ai.client.token.usage` and `gen_ai.client.operation.duration`.

Content is deliberately opt-in: `gen_ai.system_instructions`,
`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.call.arguments`,
and `gen_ai.tool.call.result` are all marked `Opt-In`, and
the spec's default posture is *don't record inputs and outputs at all*, with a
third pattern — store content externally, record references on the span — for
production. That default exists because the spec authors know what you are about
to learn in the PII section.

> [!PATTERN] Emit the standard, choose the backend later
> Instrument with `gen_ai.*` attribute names even if you start by writing JSONL
> to disk. Every serious backend speaks OTLP; naming your fields to the
> convention means switching tools is a config change, not a re-instrumentation.

The tool landscape in one honest paragraph: Langfuse is the self-host option —
the core is MIT-licensed (`ee/`, `web/src/ee/`, and `worker/src/ee/` are not)
and runs from Docker. LangSmith and Braintrust are proprietary managed
platforms; both list self-hosted/on-prem deployment only on their Enterprise
pricing tier, gated behind a sales call rather than a price. All three do traces, prompt
management, and eval scoring; none of them matters as much as whether your spans
carry the data above. For a solo practitioner, self-hosted Langfuse or a plain
OTLP collector writing to disk is enough, and the standard keeps the exit door
open.

## Claude Code is already instrumented

You do not have to build any of this for your own agent sessions — Claude Code
ships an OpenTelemetry exporter behind an environment variable:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

That emits `claude_code.token.usage` (in tokens), `claude_code.cost.usage` (in
USD), `claude_code.session.count`, and per-tool events. Prompt content is off
by default (`OTEL_LOG_USER_PROMPTS=1` to opt in).

Span-level tracing — one trace per request, linking the prompt to the API
calls and tool executions it triggered — is a separate beta: set both
`CLAUDE_CODE_ENABLE_TELEMETRY=1` and `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`,
then point `OTEL_TRACES_EXPORTER` at a destination. That gets you the trace
shape, not the content inside it — tool arguments and raw model output
(`tool_input`, `response.model_output`) are outside the stable span schema and
only appear under a further gate, `ENABLE_BETA_TRACING_DETAILED=1` plus
`BETA_TRACING_ENDPOINT`, and interactive CLI sessions additionally need the
organization allowlisted for it (the Agent SDK and non-interactive `-p` runs
are not gated). If you already route grunt work to cheaper models by policy,
this is the measured version of that instinct — actual dollars per session
type instead of vibes. It composes with a transcript-logging `Stop` hook (see
Hooks for the event): OTel for the numbers, the hook for the replayable text.

## Sampling: you probably shouldn't

Head-based sampling exists for services doing millions of requests. A solo
product doing 500 requests a day at ~10k tokens each generates on the order of
20 MB of trace text daily — storage is not the constraint, and every discarded
trace is a debugging session you can't have and an eval case that never exists.
Keep 100% while volume is low and value per request is high, which describes
quote drafting, lien-waiver generation, and every other B2B document workflow
where one request maps to real money.

When volume does force sampling, sample the successes, never the failures:
keep 100% of errors, refusals, and schema-validation failures, and sample the
happy path. The failures are the traces you were collecting for.

## Traces are a copy of everything users typed

A trace store is a second database containing every name, address, contract
amount, and pasted credential that ever entered a prompt — without the access
controls your real database has. Scrubbing and retention are not compliance
theatre; they are the difference between "we log requests" and "we exfiltrated
our users' data to ourselves."

Minimum policy: scrub credential-shaped strings (API keys, `Bearer` tokens,
JWTs, anything matching a `sk-`/`pk-` prefix) at write time, before storage;
hash user identifiers instead of storing them raw; set a retention window —
30 days of raw content is a defensible default for a solo product — and let
it expire while keeping the derived metrics indefinitely. The trap is composition —
on one project (2026-07-05), two individually sensible
policies (log full transcripts verbatim; exempt `.md` files from the secret
scanner) combined into a path that would have committed any pasted credential to
plaintext. A trace pipeline is exactly such an exempted copy-machine. Audit it
the same way.

## The flywheel is the reason to start today

> [!PATTERN] The trace→eval flywheel
> Every bad production trace becomes an eval case. User reports a wrong answer →
> pull the trace → the exact input becomes a golden-set entry with the corrected
> output → the regression gate in Evals now covers it forever. Failures stop
> being incidents and become permanent test coverage. This only works if the
> trace was complete enough to replay — which is why you instrument before you
> have users, not after.

The Evals chapter says golden sets come from failures, not imagination. Traces
are where the failures are kept. Without them you are writing eval cases from
memory of what went wrong, which is imagination with extra confidence.

## Four signals worth alerting on

Dashboards you check weekly; alerts for the four that move first:

1. **Cost per request drift.** Mean cost creeping from $0.04 to $0.11 means a
   prompt grew, caching broke (watch `cache_read_input_tokens` fall), or a
   retry loop appeared. It drifts silently; the invoice arrives monthly.
2. **Refusal and error rate.** A rising refusal rate after a prompt change is a
   regression the happy-path tests won't catch.
3. **Schema-validation failure rate.** If you validate outputs per Structured
   output, that validator's failure counter is a free, deterministic quality
   metric — alert on any sustained rise.
4. **Latency p95, not mean.** Means hide the retry storms and the max_tokens
   runaways. Track time-to-first-token separately if you stream.

> [!CAUTION] Metrics without traces are alarms without evidence
> An alert that cost drifted is only actionable because you can open the ten
> most expensive traces and read them. Instrument traces first, derive the
> metrics from them — not the other way around.

---
title: Local and open-weight models
status: draft
verified: 2026-08-26
sources:
  - https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md
  - https://github.com/ggml-org/llama.cpp/blob/master/tools/perplexity/README.md
  - https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md
  - https://developer.meta.com/ai/llama4/license/
  - https://raw.githubusercontent.com/meta-llama/llama-models/main/models/llama4/LICENSE
  - https://huggingface.co/Qwen/Qwen3-8B
  - https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506
  - https://huggingface.co/mistralai/Ministral-8B-Instruct-2410
  - https://huggingface.co/mistralai/Mistral-Large-Instruct-2411
  - https://huggingface.co/openai/gpt-oss-20b
  - https://huggingface.co/deepseek-ai/DeepSeek-R1-0528
  - https://docs.vllm.ai/en/latest/
  - https://docs.ollama.com/api/openai-compatibility
  - https://github.com/ml-explore/mlx-lm
  - https://github.com/ml-explore/mlx-swift
---

Run a model locally for exactly three reasons — privacy, offline product features,
or unit economics at volume — and treat everything else as a hobby.

The hobby is fine. Pulling an 8B model onto your laptop and watching it stream
tokens with the network cable unplugged teaches you more about how these systems
work than a month of API calls. But this is a handbook about shipping, so the
chapter is organized around the shipping question: when does a model you hold beat
a model you rent?

## The three honest reasons

**Privacy and data residency.** Some data cannot leave the machine: medical
records, legal discovery, a client contract that says so. An open-weight model
running on hardware you control is the only architecture where "the data never
leaves" is a physical fact rather than a vendor promise. This is the one reason
that overrides quality entirely — if the data can't go out, the frontier model is
not on the menu.

**Offline product features.** If your product must work in airplane mode — field
apps, on-device assistants, anything offline-first — inference ships inside the
binary. The model becomes an asset in your bundle, like a font.

**Unit economics at volume.** A per-token API price that is negligible at
prototype scale becomes a line item at millions of calls per day. If a task is
narrow enough that a small model handles it, such as classification,
extraction, or routing, self-hosting converts a variable cost into fixed
hardware. Do the arithmetic against your actual volume before believing this
applies to you. For most solo-scale products it doesn't, and the cascade in
the Cost and latency chapter gets you most of the saving with none of the ops.

The honest other side comes without a benchmark citation, so treat it as a
claim to test rather than a fact. On open-ended reasoning, agentic coding, and
long-context work, frontier API models beat anything you can run on a
workstation. The gap is largest in multi-step tool use, which is exactly where
Claude Code lives. Local models win narrow, well-specified tasks. Run your own
evals (see the Evals chapter) on your task before trusting either this claim
or a leaderboard.

## The runtime landscape

Three runtimes cover the practical territory.

**llama.cpp** is the substrate. It defines GGUF, the single-file quantized model
format everything else consumes, and provides the CLI and server binaries. When
you need control over custom sampling, grammars, or exact quantization choice,
you are here.

**Ollama** is the ergonomic wrapper: model registry, lifecycle management, and a
local API. `ollama pull qwen3:8b && ollama run qwen3:8b` and you're talking to a
model. It also exposes an OpenAI-compatible API at `http://localhost:11434/v1/`
(`/v1/chat/completions`, `/v1/embeddings`, tool use, JSON mode), which matters
more than it sounds — see the cascade section below.

**MLX** is Apple's array framework for Apple silicon, and `mlx-lm`
(`pip install mlx-lm`, then `mlx_lm.generate --prompt "..."`) runs and fine-tunes
models against the M-series unified memory pool. On a Mac, MLX is typically the
faster path. `mlx-lm` itself is Python and desktop-only, but `mlx-swift` is the
bridge to on-device iOS inference — the same weights you evaluate on your desk can
ship to the phone (see the Multimodal chapter for the on-device vision variants).

> [!NOTE] Memory math
> A GGUF file at Q4_K_M weighs roughly 0.6 bytes per parameter. Measured on
> Llama 3.1 8B in the llama.cpp quantize docs: 4.58 GiB at Q4_K_M, 7.95 GiB at
> Q8_0, 14.96 GiB at F16 — so a 7B at Q4 is about 4 GB of weights. Add headroom
> for the KV cache, which grows with context length: budget the file size plus
> 1–2 GB for real sessions.

## What 4-bit actually costs

Quantization folklore runs hot in both directions — "lossless" and "lobotomy" are
both wrong. The llama.cpp perplexity tables give measured numbers for Llama 3 8B. The F16
baseline perplexity is 6.2332. Q8_0 is 6.2343, which is indistinguishable.
Q4_K_M with an importance matrix is 6.3829, about a 2.4% degradation. That is real but small:
Q4_K_M is the sensible default, which is why every registry ships it as the
standard download.

> [!CAUTION] Below 4-bit the curve bends
> The same table shows Q2_K with an importance matrix at 8.65 perplexity against
> the 6.23 baseline — a 39% jump, an order of magnitude worse than the F16→Q4
> step. Without an importance matrix Q2_K is worse still, at 9.75 — a 56% jump.
> Sub-4-bit quants trade correctness for memory at a steep rate. If the model
> doesn't fit at Q4, pick a smaller model rather than a smaller quant.

Perplexity is also an imperfect proxy — the llama.cpp docs themselves note that
fine-tunes often raise perplexity while improving human-rated output. Treat these
numbers as relative quality within one base model, and confirm on your own task.

## Choose by license, not by benchmark

Benchmarks reshuffle monthly; license terms are what you actually ship under.
Verified against the license files and model cards as of 2026-08:

| Family | License | The catch |
|---|---|---|
| Qwen3 (e.g. Qwen3-8B) | Apache-2.0 | none |
| Mistral, Small line 3.1+ (e.g. Mistral Small 3.2 24B) | Apache-2.0 | Large and Ministral lines use the Mistral Research License instead — license is per model line, not per size |
| gpt-oss-20b / 120b | Apache-2.0 | none |
| DeepSeek-R1 | MIT | none |
| Llama 4 | Llama Community License | not open source in the OSI sense |

The Llama license is workable but conditional: past 700M monthly active users,
you must request a separate license from Meta; you must "prominently display 'Built
with Llama'" in your product; derivative models must include "Llama" at the start
of their name; and use is bound to Meta's Acceptable Use Policy. None of that
blocks a typical product, but each condition is a clause your future acquirer's
lawyers will read.

> [!PATTERN] The license-first shortlist
> Filter by license, then by memory fit, then benchmark the survivors on your own
> eval set. Start from Apache-2.0/MIT families (Qwen, Mistral's Small line,
> gpt-oss, DeepSeek) and you skip attribution requirements, naming constraints,
> and AUP re-review on every model swap. A 2-point benchmark lead does not repay
> a licensing dependency in a product you intend to sell.

## Serving beyond the laptop

If local graduates from your machine to a product backend, the runtime changes:
llama.cpp and Ollama optimize for one user, not for concurrent load. vLLM is the
standard server. It does continuous batching of incoming requests and
PagedAttention for KV-cache memory management, behind an OpenAI-compatible
endpoint, and it speaks the Anthropic Messages API too. Continuous batching is
the headline: requests join and leave the batch mid-generation instead of
waiting for the slowest sequence, which is where the throughput that makes
self-hosting economical comes from. That's the one paragraph. If you are
provisioning GPUs for vLLM you have left this handbook's scope and entered ops.

## The bottom tier of the cascade

The Cost and latency chapter builds a model cascade: cheap models handle the easy majority,
expensive models get the escalations. A local model is the natural floor —
per-token cost of zero, no rate limits, no egress. Because Ollama speaks the
OpenAI wire format, the floor is a config change, not a code change: point the
base URL at `localhost:11434/v1` for the classify/route/extract tier and keep
Claude for everything that thinks. This also gives you an offline dev loop — your
test suite's LLM calls run free and disconnected, and only staging touches the
metered API.

Structured output is where local runtimes are quietly ahead of most APIs.
llama.cpp supports GBNF, a BNF-style grammar format that constrains decoding
itself. The sampler can only emit tokens the grammar allows, so conformance is
guaranteed rather than requested. Pass `--grammar-file` to `llama-cli`, or a
`grammar` or `json_schema` field to `llama-server`; a converter
(`json_schema_to_grammar.py`) compiles JSON Schema to GBNF ahead of time. The
schema shapes only the output, not the prompt. For the parse-or-retry discipline
this replaces, see the Structured output chapter.

> [!FIELD] 2026-08 — the phone is a deployment target, not a demo
> Working offline-first on iOS from an M-series Mac: the loop that works is to
> evaluate with `mlx-lm` on the desktop, then ship the same small quantized model
> on-device via `mlx-swift` (CoreML is the alternative route). The desktop Mac
> is a faithful preview because it shares the unified-memory architecture, but
> it is not a faithful preview of thermals or RAM ceilings on a phone, so
> budget a device-testing pass for sustained generation, not just first-token
> demos.

The summary you can act on is that local is a floor and a fence. It puts a
cost floor under your cascade and a fence around data that can't leave. For
everything above the floor and outside the fence, the Building on the API
chapter is still the one that matters.

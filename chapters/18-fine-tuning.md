---
title: Fine-tuning and distillation
status: draft
verified: 2026-08-26
sources:
  - https://developers.openai.com/api/docs/guides/supervised-fine-tuning
  - https://developers.openai.com/api/docs/pricing
  - https://platform.claude.com/docs/en/about-claude/pricing
  - https://docs.aws.amazon.com/bedrock/latest/userguide/custom-model-fine-tuning.html
  - https://docs.aws.amazon.com/bedrock/latest/userguide/model-distillation.html
  - https://docs.aws.amazon.com/bedrock/latest/userguide/prequisites-model-distillation.html
  - https://arxiv.org/abs/2106.09685
  - https://arxiv.org/abs/2305.14314
  - https://arxiv.org/abs/2305.11206
  - https://arxiv.org/abs/2308.08747
  - https://www.anthropic.com/legal/commercial-terms
---

Fine-tuning is the last rung on the optimization ladder, and as a solo practitioner
on frontier APIs you will almost never need to climb that high. When you do, it
is for cost at volume, not for capability.

The rest of this chapter is the ladder, the failure modes gradient descent
actually fixes, and a worked cost comparison showing where the crossover really sits.

## The ladder

Climb in this order. Each rung is cheaper to try, faster to iterate, and easier to
undo than the one above it.

1. **Prompting.** Rewrite the instructions. See the Prompting chapter.
2. **Few-shot examples.** Paste three to ten worked examples into the prompt. With
   prompt caching they cost 0.1x input price per request after the first.
3. **Retrieval.** If the model lacks facts, give it facts at request time. See
   the Retrieval chapter.
4. **Fine-tuning.** Change the weights.

> [!PATTERN] The 50-example gate
> Before committing to a fine-tune, put 50 of your training examples into the prompt
> of a cheap model as few-shot context and measure. OpenAI's own guidance runs the
> same test through gradient descent: start with 50 demonstrations, and "if 50
> examples have no impact, rethink your task or prompt before adding training data."
> A task that 50 examples can't move is mis-specified, and no amount of data fixes a
> specification problem.

## What gradient descent fixes — and what it can't

Fine-tuning reliably fixes three things:

- **Format and style adherence.** A tuned model emits your exact JSON shape, your
  house tone, your label taxonomy, without being told each time. (Check the
  Structured output chapter first — schema enforcement at the API level solves
  most format problems for free.)
- **Narrow classification at volume.** One task, fixed labels, millions of rows.
- **Cost and latency.** A small tuned model replaces a large prompted one, and drops
  the per-request instruction overhead: the instructions move into the weights.

It does not add knowledge, and it does not add reasoning. LIMA (Zhou et al., 2023)
fine-tuned a 65B model on just 1,000 curated examples and matched or beat GPT-4
responses in 43% of human evaluations — the authors' conclusion is that "almost all
knowledge in large language models is learned during pretraining." Fine-tuning
teaches form, not facts. Facts that change belong in retrieval; a fine-tune bakes
them in stale, and refreshing them means training again. And a small model tuned on
a reasoning task learns to imitate the surface of reasoning traces, not the
reasoning — it fails precisely on the inputs that weren't in distribution.

## No golden set, no fine-tune

Fine-tuning is an eval-first activity twice over. The training set *is* a golden set of hundreds of labeled input/output pairs.
If you can't produce one, you can't fine-tune. If you can, run it as few-shot
and eval first (see the Evals chapter). Second, you need a held-out eval to know whether the tune worked,
and a broader one to know what it broke.

> [!CAUTION] Tuning causes regressions, not just improvements
> Catastrophic forgetting is measurable in the size range most solo practitioners
> would touch: Luo et al. (arXiv:2308.08747) observe forgetting of domain
> knowledge, reasoning, and reading comprehension across 1B–7B models during
> continual fine-tuning, and severity *increases* with scale in that range. The
> study stops at 7B — it doesn't cover the 8B open-weight models or the 65B QLoRA
> target this chapter itself recommends below, so read the trend as a reason to
> measure at your actual size, not as a measurement of it. Keep an out-of-task
> eval suite and run it against every checkpoint. A tuned model that gains 4
> points on your task and silently loses the ability to follow negations is a net
> loss.

## The practical routes

**Hosted API fine-tuning (the reference mechanics).** OpenAI's supervised
fine-tuning is the pattern every hosted offering copies: upload a JSONL file where
each line is `{"messages": [{"role": "user", ...}, {"role": "assistant", ...}]}` to
`/v1/files` with `purpose="fine-tune"`, create a job at `/v1/fine_tuning/jobs`
naming a base model, and get back a model id like
`ft:gpt-4.1-nano-2025-04-14:org::BTz2REMH` that you call like any other model. The
minimum is 10 examples; the docs recommend starting with 50 and report improvements
in the 50–100 range.

> [!NOTE] The reference implementation is winding down
> As of August 2026, OpenAI's fine-tuning docs state: "OpenAI is winding down the
> fine-tuning platform. The platform is no longer accessible to new users." Existing
> users can still create jobs "for the coming months." Read that as the market
> agreeing with this chapter's thesis: for most workloads, prompt caching plus a
> cheap base model beats a tuned one, and the vendor with the most fine-tuning
> customers concluded the product wasn't worth running.

**Claude.** Anthropic's first-party API has no fine-tuning endpoint — everything
goes through `/v1/messages`. The only supported path is supervised fine-tuning of
Claude 3 Haiku (`anthropic.claude-3-haiku-20240307-v1:0:200k`) on Amazon Bedrock,
us-west-2 only. Distillation is off the table too, and more definitively than a
missing table row. AWS's prerequisites page for Bedrock Model Distillation states
outright that "distillation is not currently available for Anthropic models on
Amazon Bedrock. There is no confirmed timeline for when Anthropic distillation
will be restored." The only trace that it once worked is a leftover line
elsewhere on the same page about which region runs "Claude and Llama"
distillation jobs. Tuning a 2024-era Claude 3 Haiku when Haiku 4.5 exists off
the shelf is rarely the right trade. In practice you prompt Claude, and you
don't tune it.

**Open weights with LoRA/QLoRA.** This is the route that still makes sense in 2026,
because you own the artifact. LoRA (Hu et al., arXiv:2106.09685) freezes the base
weights and trains small low-rank adapter matrices — up to 10,000x fewer trainable
parameters and 3x less GPU memory than full fine-tuning, at equal or better quality,
with no added inference latency. QLoRA (Dettmers et al., arXiv:2305.14314) trains
those adapters on top of a 4-bit-quantized base, enough to fine-tune a 65B model on
a single 48GB GPU while matching 16-bit fine-tuning performance; its Guanaco model
took 24 hours on one GPU. For an 8B model the same recipe fits on a rented consumer
card, and the data requirement is the same hundreds-to-low-thousands range: 50–100
examples show measurable gains (OpenAI's numbers), and 1,000 curated examples
produced LIMA. The adapter is a file you version, eval, and roll back — no vendor can wind
it down.

## Distillation: the one that pays

Distillation is fine-tuning where the frontier model writes your training data: run
Claude Opus over a few thousand representative inputs, keep the outputs that pass
your eval, and train a small model on the pairs. It is the natural endpoint of the
model cascade in the Cost and latency chapter, where the frontier model
graduates from serving requests to labeling them. The underrated version is
passive logging: if you already run an extraction or classification pipeline
on a frontier model, log every request/response pair from day one. You are accumulating a distillation set at zero marginal cost, and the day
volume justifies a small model, the training data already exists.

> [!CAUTION] Read the terms before you distill
> Anthropic's Commercial Terms (§D.4) prohibit using the services "to build a
> competing product or service, including to train competing AI models." A narrow
> internal classifier for your own product is a different animal from a
> general-purpose model you sell, but the boundary is a legal judgment, not an
> engineering one. Know the clause exists before you build on top of it.

## Worked example: classifying 10,000 scraped leads

Task: label each scraped lead as qualified/unqualified with a 500-token rubric prompt,
~250 tokens of lead text, ~20 tokens out.

**Route A — Haiku 4.5, Batches API + prompt caching.** Batch pricing is $0.50/$2.50
per MTok (50% off $1/$5), and the 0.1x cache-read multiplier stacks with it. The
rubric is 5M cached tokens across 10k rows at $0.05/MTok = $0.25; unique lead text
2.5M × $0.50 = $1.25; output 0.2M × $2.50 = $0.50. **Total ≈ $2.00**, no training
step, and next week's rubric change is an edit, not a retrain.

**Route B — fine-tuned gpt-4.1-nano.** Training: 300 labeled examples × ~300 tokens
× 3 epochs ≈ 0.27M tokens at $1.50/MTok ≈ $0.41. Inference needs no rubric: 2.5M
input × $0.20 = $0.50, output 0.2M × $0.80 = $0.16. **Total ≈ $1.07** — plus
labeling 300 examples, an eval harness, and a dependency on a platform that has
announced its wind-down.

At 10k rows, gradient descent saves about ninety cents. Run the same arithmetic at
10M rows and route A costs ~$2,000 against route B's ~$660. Now the tune pays,
and an open-weight LoRA (route B's economics without the platform risk) pays
more. That is the whole decision in one number. Fine-tune when *volume ×
per-request savings* clears the fixed cost of data, training, and a regression
eval suite by an order of magnitude, and not before.

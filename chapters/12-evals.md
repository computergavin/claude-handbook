---
title: Evals
status: draft
verified: 2026-08-26
sources:
  - https://platform.claude.com/docs/en/docs/build-with-claude/develop-tests
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://arxiv.org/abs/2306.05685
  - https://arxiv.org/abs/2404.13076
  - https://developers.openai.com/cookbook/examples/evaluation/use-cases/regression
  - https://hamel.dev/blog/posts/evals/
  - https://hamel.dev/blog/posts/llm-judge/
---

An eval is a test suite for model behavior: without one, every prompt change is a
deploy on vibes, and you cannot tell an improvement from a regression.

This is the largest gap in this handbook's own practice. The quote-drafter, the
lead-extraction pipelines, and the market-intel summarizers all shipped with quality
judged by eyeball. This chapter is imported research, not run experience — hence
`status: draft` — but the sources are primary and the plan below is concrete.

## When evals pay

Anthropic's agent-evals guide draws the line plainly: "after the early prototyping
stages, once an agent is in production and has started scaling, building without
evals starts to break down." And the cost curve is asymmetric — "evals get harder to
build the longer you wait," because the failure modes you would have harvested into
test cases evaporate if you never logged them.

Skip the harness when you are prototyping a one-off script. Build it when you
ship a pipeline whose output someone else consumes, such as a drafted quote or
an extracted lead list. The
payoff compounds at model-upgrade time: with a harness, swapping models is an
afternoon of runs instead of a week of nervous spot-checks.

> [!FIELD] The eyeball plateau — 2026-08-26
> **What happened.** Three LLM products shipped with no eval harness; every prompt
> tweak was judged by reading a handful of outputs.
>
> **Why it happened.** Eyeballing feels fast and evals feel like overhead — until a
> prompt change silently breaks a case you fixed two months ago and nothing catches
> it.
>
> **What changed.** Trace logging (below) goes into every pipeline as of now, because
> it is the precondition for everything else in this chapter.

## Traces are the cheap precondition

Golden sets, judges, and regression gates are all built from production
traces. Capturing them costs one function:

```python
def log_trace(input, output, prompt_version, model, path="traces.jsonl"):
    with open(path, "a") as f:
        f.write(json.dumps({"ts": time.time(), "prompt_version": prompt_version,
                            "model": model, "input": input, "output": output}) + "\n")
```

Append-only JSONL, no platform, no schema migration. Hamel Husain (practitioner
lead, not a primary source) makes the companion point: "you must remove all
friction from the process of looking at data" — a 50-line HTML viewer over that
file beats a generic dashboard you never open.

## Golden sets come from failures, not imagination

Anthropic's guidance for a starting set is "20–50 simple tasks drawn from real
failures," not hundreds of synthetic ones. The quality bar for each task: "a good
task is one where two domain experts would independently reach the same pass/fail
verdict." Ambiguous tasks produce noisy scores that teach you nothing.

Husain's version of the same number (lead): label around 30 examples and keep going
until you stop seeing new failure modes. For a solo practitioner the "principal
domain expert" is you — which is convenient, because his core recommendation is one
expert making binary pass/fail calls with a written critique per example, not a
committee averaging Likert scores.

> [!PATTERN] Critique shadowing (Hamel Husain)
> Label 30ish traces pass/fail with a one-sentence critique each. Build an LLM judge
> prompted with those critiques as examples. Measure its agreement against your
> labels, fix the biggest disagreement, repeat. In his Honeycomb case study this hit
> over 90% judge–human agreement in three prompt iterations. The critiques are the
> asset; the judge is compiled from them.

## Assertions before judges

Anthropic's develop-tests guide is blunt about grader choice: pick "the fastest,
most reliable, most scalable method," and that is code-based grading whenever the
task allows it. Lead extraction is exact-match territory — field-level string
comparison against golden records, plus assertions like "phone number matches
`^\+?[\d\s()-]{7,}$`" and "no field contains the literal string `null`". These are
ordinary unit tests that happen to wrap a model call. Rechat ran hundreds of such
assertions, including one that just checked no raw UUID leaked into user-facing
output (Husain, lead).

Graded evals use a judge to score tone, faithfulness, and coverage. They cover
the outputs assertions can't reach, such as the quote-drafter's register and
the summarizer's selection of what mattered. Use them second, and calibrate them (below), because a judge you
haven't checked is an opinion, not a metric.

Anthropic's design principle for the set as a whole: "more questions with slightly
lower signal automated grading is better than fewer questions with high-quality
human hand-graded evals." Volume of automated checks beats artisanal ones.

## LLM-as-judge and its documented failure modes

The MT-Bench paper (Zheng et al., 2023, arXiv:2306.05685) made the case for
LLM judges: GPT-4 agreed with human preferences over 80% of the time, which
matches human–human agreement. The same paper documented their systematic
biases:

- **Position bias** — in pairwise comparison, the judge favors an answer because of
  where it appears, not what it says.
- **Verbosity bias** — longer answers score higher independent of quality.
- **Self-enhancement bias** — judges favor outputs from models like themselves.
- **Weak grading of math and reasoning** — the judge can't grade what it can't solve.

Panickssery et al. (2024, arXiv:2404.13076) sharpened the self-preference
result. An LLM's ability to recognize its own outputs correlates linearly with
how strongly it favors them, and fine-tuning for better self-recognition
increases the bias. The link is causal, not coincidental. Anthropic's practical
translation: grade with a different model than the one that generated the output.

The MT-Bench paper offers three mitigations. Run every pairwise comparison
twice with positions swapped and count only consistent verdicts. Provide a
reference answer when one exists. Ask for reasoning before the verdict.

> [!CAUTION] A judge inflates the metric it's biased toward
> Verbosity bias means "make the summary more thorough" prompt changes will score
> better on an uncalibrated judge even when users wanted shorter output. The judge
> agreeing with you is not evidence — the judge agreeing with your labeled sample is.

## Rubric vs pairwise

Pairwise ("which of A/B is better?") is the right shape for choosing between two
prompt versions or models, and it inherits position bias — always swap and re-run.
Rubric grading (score one output against written criteria) is the right shape for CI,
because it needs no baseline output to compare against. Anthropic's agent guide adds two refinements. Grade each dimension separately
rather than asking for one holistic score, and give the judge an explicit
"Unknown" option so it doesn't hallucinate a verdict. And per Husain (lead): make each dimension
binary. "Tracking a bunch of scores on a 1-5 scale is often a sign of a bad eval
process" — nobody can act on the difference between a 3 and a 4.

## Calibrate the judge against a human-labeled sample

The lesser-known step that turns a judge from vibes into an instrument is
calibration. Before trusting it, run it over the 30–50 traces you hand-labeled
and measure agreement.
Report precision and recall separately, not raw agreement — if 90% of your traces
pass, a judge that says "pass" unconditionally scores 90% agreement while catching
nothing. Iterate on the judge prompt until disagreements are ones you'd concede.
Then re-check quarterly with fresh labels, because your product and its failure
modes drift.

## Regression-gating prompt changes in CI

The structure OpenAI's Evals API formalizes is worth copying even if you never use
the API: an *eval* is the fixed part (dataset schema plus grading criteria); a *run*
is one prompt version executed against it. Their regression cookbook demonstrates
the loop: baseline prompt and candidate prompt as two runs against the same
eval, with the scores compared. The CI translation for any stack:

```bash
python run_evals.py --prompt prompts/quote_v14.txt --golden golden/quotes.jsonl
# exit 1 if assertion pass-rate < baseline, or any previously-passing case fails
```

Gate on "no previously-passing case regresses," not on the aggregate score —
aggregates let a new prompt trade five fixed cases for three broken ones and still
merge.

## Agent evals: outcome vs trajectory

For multi-turn agents, grade the world, not the transcript. Anthropic's example: a
flight-booking agent whose transcript claims success while no reservation exists in
the database. Outcome grading checks the final environment state; trajectory review
reads the transcript to learn *why* a result happened — which tools were called, in
what order, at what cost.

Non-determinism gets its own metrics: **pass@k** (at least one of k attempts
succeeds) versus **pass^k** (all k succeed). "At k=1, they're identical (both equal
the per-trial success rate). By k=10, they tell opposite stories: pass@k approaches
100% while pass^k falls to 0%." For anything user-facing, pass^k is the honest
number — users don't get k attempts.

> [!NOTE] Where to start on the existing products
> Lead extraction: golden set of 30 traces, exact-match assertions, CI gate — one
> day of work, no judge needed. Quote-drafter: trace logging now, 30 labeled traces
> with critiques, then a calibrated binary-rubric judge. That ordering is the whole
> chapter in two sentences.

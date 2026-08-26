---
title: Source list
status: draft
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/llms.txt
  - https://code.claude.com/docs/en/sub-agents
  - https://code.claude.com/docs/en/hooks-guide
  - https://code.claude.com/docs/en/agent-teams
  - https://code.claude.com/docs/en/security
  - https://code.claude.com/docs/en/sandboxing
  - https://docs.claude.com/en/api/overview
  - https://platform.claude.com/docs/en/models/overview
  - https://platform.claude.com/docs/en/build-with-claude/prompt-caching
  - https://platform.claude.com/docs/en/build-with-claude/batch-processing
  - https://platform.claude.com/docs/en/build-with-claude/streaming
  - https://platform.claude.com/docs/en/build-with-claude/structured-outputs
  - https://platform.claude.com/docs/en/docs/build-with-claude/develop-tests
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://www.anthropic.com/news/contextual-retrieval
  - https://developers.openai.com/api/docs/guides/prompt-caching
  - https://developers.openai.com/api/docs/guides/batch
  - https://developers.openai.com/api/docs/guides/embeddings
  - https://developers.openai.com/api/docs/guides/structured-outputs
  - https://developers.openai.com/cookbook/examples/evaluation/use-cases/regression
  - https://docs.cohere.com/docs/rerank
  - https://docs.voyageai.com/docs/flexible-dimensions-and-quantization
  - https://owasp.org/www-project-top-10-for-large-language-model-applications/
  - https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices
  - https://arxiv.org/abs/2306.05685
  - https://arxiv.org/abs/2404.13076
  - https://arxiv.org/abs/2212.10496
  - https://arxiv.org/abs/2104.08663
  - https://arxiv.org/abs/2503.18813
  - https://arxiv.org/abs/2408.02442
  - https://dl.acm.org/doi/10.1145/1571941.1572114
  - https://hamel.dev/blog/posts/evals/
  - https://hamel.dev/blog/posts/llm-judge/
  - https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
  - https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks
---

Every load-bearing fact in this handbook traces to a source on this page, and a
source gets on this page by clearing one of three bars — not by being interesting.

## The vetting standard

Three tiers. Each tier is authoritative for a different kind of claim, and a source
cited outside its tier is a bug in the handbook.

**PRIMARY — vendor docs, official specs, standards bodies.** Authoritative for facts
about their own systems: model IDs, prices, limits, config keys, protocol
requirements. They are also the fastest-rotting tier — vendors change pricing pages
without notice and without changelogs. A primary source is trusted as of the date it
was fetched and not one day longer; re-verify by date before repeating a number
from one.

**PAPERS — peer-reviewed, or arXiv work that has been widely replicated.**
Authoritative for measured results: benchmark deltas, bias effects, degradation
figures. A paper's numbers are frozen at publication, so the check is different —
not "is this still on the page" but "did the finding hold up." Before citing a
result, look for replications and for follow-up work that narrowed or reversed it.

**PRACTITIONER LEADS — named individuals with a track record.** These are leads to
verify, never sources for facts. A practitioner post earns a citation when it
originates a framing (the lethal trifecta), discloses a technique first (tool
poisoning), or distills real engagement volume into heuristics worth testing. What
it never does is settle a factual claim on its own.

> [!PATTERN] The blog-post test
> A claim that exists only in a blog post is unverified, house rule. Either trace it
> to a primary source or a paper, reproduce it yourself and file it as a dated FIELD
> note, or label it a lead inline. Citing a practitioner post as if it were
> documentation is the one way a chapter fails review outright.

Anything that clears none of the three bars stays out. This list carries no
"included with reservations" section — a source you have to caveat is a source you
drop.

## Claude Code

- [Claude Code docs index (llms.txt)](https://code.claude.com/docs/llms.txt) —
  **primary**. The full docs map; the recovery point when a cited page moves.
- [Sub-agents](https://code.claude.com/docs/en/sub-agents) — **primary**. Subagent
  configuration, front matter, and tool/model inheritance.
- [Hooks guide](https://code.claude.com/docs/en/hooks-guide) — **primary**. Hook
  events, exit-code and JSON communication, hook types, timeouts.
- [Agent teams](https://code.claude.com/docs/en/agent-teams) — **primary**. Team
  lifecycle, lead/teammate mechanics, task coordination.

## The API and its cost model

- [API overview](https://docs.claude.com/en/api/overview) — **primary**. The
  Messages endpoint shape; the page to check for current model IDs and limits.
- [Models overview](https://platform.claude.com/docs/en/models/overview) —
  **primary**. The pricing table, output/input price ratios, batch and cache-read
  footnotes.
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  — **primary**. Cache-write multipliers, TTL semantics, token minimums,
  breakpoints, the lookback window.
- [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
  — **primary**. The 50% discount, batch limits, cache stacking, expected hit-rate
  range.
- [Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
  — **primary**. The SDK streaming requirement for large `max_tokens` requests.
- [OpenAI — prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
  — **primary**. The contrast case: explicit caching at 1.25x write / 0.1x read,
  30-minute TTL. Authoritative for OpenAI's cache model only.
- [OpenAI — Batch API](https://developers.openai.com/api/docs/guides/batch) —
  **primary**. The contrast case: 50% discount, 24-hour completion window.

## Evals

- [Define success criteria and build evaluations](https://platform.claude.com/docs/en/docs/build-with-claude/develop-tests)
  — **primary**. Grader-choice guidance and the volume-over-quality eval design
  principle.
- [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
  — **primary**. Outcome vs trajectory grading, the 20–50-tasks-from-real-failures
  starting point, judge calibration, pass@k vs pass^k.
- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena — Zheng et al., 2023](https://arxiv.org/abs/2306.05685)
  — **paper** (NeurIPS 2023). The four judge biases, the >80% GPT-4/human agreement
  figure, and the mitigations.
- [LLM Evaluators Recognize and Favor Their Own Generations — Panickssery et al., 2024](https://arxiv.org/abs/2404.13076)
  — **paper**. The causal link between self-recognition and self-preference bias in
  LLM judges.
- [Detecting prompt regressions — OpenAI Cookbook](https://developers.openai.com/cookbook/examples/evaluation/use-cases/regression)
  — **primary**. The eval/run data structure and the baseline-vs-candidate
  regression workflow.
- [Your AI Product Needs Evals — Hamel Husain](https://hamel.dev/blog/posts/evals/)
  — **practitioner lead**. The three-level eval framework, the Rechat worked
  examples, and the friction-removal advice. Labeled as a lead where cited.
- [Creating a LLM-as-a-Judge That Drives Business Results — Hamel Husain](https://hamel.dev/blog/posts/llm-judge/)
  — **practitioner lead**. Critique shadowing, binary-over-Likert grading, the
  ~30-example heuristic — distilled from roughly thirty company engagements.
  Labeled as a lead where cited.

## Retrieval

- [Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
  — **primary**. The contextual-retrieval technique and the vendor's own benchmark
  numbers for it.
- [Cohere Rerank documentation](https://docs.cohere.com/docs/rerank) — **primary**.
  Rerank model names and token limits.
- [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)
  — **primary**. Embedding model dimensions, MTEB scores, the `dimensions`
  parameter.
- [Voyage AI — Flexible Dimensions and Quantization](https://docs.voyageai.com/docs/flexible-dimensions-and-quantization)
  — **primary**. Matryoshka dimensions and quantization dtypes.
- [Reciprocal rank fusion outperforms Condorcet — Cormack, Clarke, Buettcher](https://dl.acm.org/doi/10.1145/1571941.1572114)
  — **paper** (SIGIR 2009). The RRF formula and its measured win over Condorcet
  fusion and learned rank methods.
- [Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)](https://arxiv.org/abs/2212.10496)
  — **paper**. The hypothetical-document-embedding technique.
- [BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of IR Models](https://arxiv.org/abs/2104.08663)
  — **paper** (NeurIPS 2021). The BM25-robustness result and the reranker findings
  across domains.

## Agent security

- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
  — **primary**. The LLM01 Prompt Injection ranking and the Excessive Agency entry.
- [MCP Specification — Security Best Practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)
  — **primary**. Confused deputy, the token-passthrough prohibition, session
  hijacking, scope minimization.
- [Claude Code — Security](https://code.claude.com/docs/en/security) — **primary**.
  The isolated web-fetch context window, MCP first-use trust verification and its
  `-p` exemption, network-command approval behavior.
- [Claude Code — Sandboxing](https://code.claude.com/docs/en/sandboxing) —
  **primary**. Seatbelt/bubblewrap enforcement, `network.allowedDomains`, credential
  masking with sentinel values and `injectHosts`.
- [Defeating Prompt Injections by Design (CaMeL) — Debenedetti et al.](https://arxiv.org/abs/2503.18813)
  — **paper**. The dual-LLM capability mechanism and the 77% vs 84% AgentDojo
  numbers.
- [The lethal trifecta for AI agents — Simon Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
  — **practitioner lead**. Originates the term and the framing; cited for the
  framing, never as sole factual support.
- [MCP Tool Poisoning Attacks — Invariant Labs](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks)
  — **practitioner lead**. The original April 2025 disclosure of tool poisoning,
  rug pulls, and cross-server shadowing, with reproduced proofs of concept. Cited
  for those demonstrations, named inline.

## Structured output

- [Structured outputs — Claude API docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
  — **primary**. `output_config.format`, strict tool use, schema limitations, the
  grammar cache, feature compatibility.
- [Structured Outputs — OpenAI API guide](https://developers.openai.com/api/docs/guides/structured-outputs)
  — **primary**. Structured Outputs vs JSON mode, the required-fields/null-union
  rule, unfit-input guidance.
- [Let Me Speak Freely? — Tam et al.](https://arxiv.org/abs/2408.02442) — **paper**.
  The GSM8K degradation figures under format restriction, the key-ordering finding,
  the parsing-error analysis, the NL-to-Format condition.

> [!NOTE] Sources rot — the date is part of the citation
> Every entry above was vetted on 2026-08-26, and that date is the strongest claim
> this page makes. Primary docs change without notice; papers get superseded;
> practitioner posts quietly get edited. When you cite an entry from here in a
> chapter, the chapter's `verified` date asserts you re-checked the source then —
> not that this list once did. Re-verify the tier-appropriate way: primary sources
> by re-fetching the page, papers by checking for replications, leads by tracing the
> claim to one of the other two tiers.

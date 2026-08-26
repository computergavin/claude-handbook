---
title: Retrieval
status: draft
verified: 2026-08-26
sources:
  - https://www.anthropic.com/news/contextual-retrieval
  - https://docs.cohere.com/docs/rerank
  - https://developers.openai.com/api/docs/guides/embeddings
  - https://docs.voyageai.com/docs/flexible-dimensions-and-quantization
  - https://dl.acm.org/doi/10.1145/1571941.1572114
  - https://arxiv.org/abs/2212.10496
  - https://arxiv.org/abs/2104.08663
---

Most RAG failures are retrieval failures, and retrieval is the one part of the
pipeline you can measure and fix in isolation — so measure it first, then spend on
improvements in order of cost.

The naive pipeline — chunk on a fixed size, embed, cosine top-k, stuff into the
prompt — is where the quote-generator sits today. Every upgrade below is judged the
same way: does recall@k on a labeled set go up, and what does it cost per query.

## Measure retrieval before touching generation

Build a labeled set before changing anything. For a quote-drafting corpus that means
30–50 real incoming requests, each paired with the past quote you would actually
pull to draft from. Recall@k is then one number: the fraction of queries whose known
correct chunk appears in the top k results. No LLM, no judge, runs in seconds.

Anthropic's contextual-retrieval evaluation uses exactly this shape — failure rate
defined as 1 − recall@20 — and their baseline pipeline fails on 5.7% of queries.
That's the honest picture of naive RAG: it works most of the time, which is why the
failures are invisible until you count them.

> [!CAUTION] End-to-end evals hide retrieval bugs
> If you only grade final drafts, the model papers over some of your retrieval
> misses by improvising, and you misattribute the rest to prompting. Retrieval
> recall and generation quality are separate dials. Tune them separately.

## Chunking is a tradeoff, not a parameter

Small chunks embed crisply but lose context ("the payment terms are net 30" — of
which quote?). Large chunks keep context but blur the embedding across topics and
burn prompt tokens per retrieved result. There is no universal number; there is a
structure in your documents, and chunking that ignores it loses.

Quotes have strong structure: header, scope of work, line items, exclusions, terms.
Chunk on those boundaries, not on 512 tokens. A line-item table split mid-row is
unrecoverable at retrieval time. Overlap (10–20%) is a patch for boundary loss when
you *can't* chunk on structure — with structure-aware chunking you mostly don't need
it.

## Hybrid retrieval: BM25 is not legacy

The BEIR benchmark (Thakur et al., NeurIPS 2021) evaluated retrieval systems
zero-shot across 18 datasets and found BM25 a robust baseline that dense models
often fail to beat out of domain. Your corpus is out of domain — no embedding model
was trained on construction quotes. Dense retrieval finds "moisture mitigation"
when the query says "vapor barrier"; BM25 finds the exact SKU, the model number,
the "G702" that embeddings smear into generic similarity. You want both.

Merge the two ranked lists with reciprocal rank fusion (Cormack, Clarke & Büttcher,
SIGIR 2009): score each document by Σ 1/(k + rank) across the lists (k = 60 in the
paper), sort by the sum. No score normalization, no tuning, ~5 lines of code, and
in the paper it beat every individual system it fused.

> [!PATTERN] RRF hybrid merge
> Run BM25 and vector search separately, take the top 50 from each, score by
> Σ 1/(60 + rank), return the fused top 20. This is the standard hybrid-search core
> in Elasticsearch, Weaviate, and pgvector setups, and you can implement it yourself
> in an afternoon.

## Contextual retrieval: the biggest measured win

Anthropic's contextual retrieval (source: their engineering post, linked above)
attacks the real defect of chunking — chunks lose their surrounding context. Before
embedding each chunk, you have a model write 50–100 tokens situating it in the
document ("This chunk is from ACME's Q2 2023 SEC filing…"), prepend that, then
embed and BM25-index the augmented chunk.

Their published numbers, on the 1 − recall@20 metric:

| Pipeline | Failure rate |
|---|---|
| Baseline embeddings | 5.7% |
| Contextual embeddings | 3.7% (−35%) |
| + contextual BM25 | 2.9% (−49%) |
| + reranking | 1.9% (−67%) |

One-time cost with prompt caching: $1.02 per million document tokens. For a corpus
of a few hundred quotes that is pocket change, and the context generation is exactly
one Haiku call per chunk with the full document cached. For quote chunks, the
generated context is where "this line item is from a 2024 commercial re-roof in a
coastal zone" gets attached to a bare price row — which is precisely what a query
needs to find it.

## Rerankers: pay latency for the last mile

A reranker is a cross-encoder that reads the query *together with* each candidate
document and scores actual relevance, instead of comparing two independently
computed vectors. BEIR found re-ranking among the best-performing approaches
zero-shot — at higher compute cost. That cost is one extra API round-trip per query
over your top ~50–150 candidates.

Cohere's current lineup is five models: `rerank-v4.0-pro`, `rerank-v4.0-fast`,
`rerank-v3.5`, `rerank-english-v3.0`, and `rerank-multilingual-v3.0` (4,096-token
query+document limit on the v3.x models; longer documents are auto-chunked).
Anthropic's numbers above show what it buys: 2.9% → 1.9% failure rate on top of an
already-good pipeline.

> [!CAUTION] Reranking is where latency enters
> Embedding lookup is milliseconds; a rerank call is a network round-trip on every
> query. For an interactive drafting tool that generates one quote per request, one
> added round-trip is nothing. For anything fanning out to many retrievals per
> action, rerank only the final merged list, never each sub-query.

## Embedding model and dimensions

Two verified reference points. OpenAI: `text-embedding-3-small` (1536 dims, 62.3%
MTEB) and `text-embedding-3-large` (3072 dims, 64.6% MTEB), both with a
`dimensions` parameter that truncates the vector — `3-large` cut to 256 dims still
outperforms full-size `ada-002`. Voyage: newer models — `voyage-4-large` is Voyage's
named example, not a blanket claim about every current model — train Matryoshka-style,
so one stored 2048-dim vector contains valid 256/512/1024-dim prefixes, selectable via
`output_dimension`, plus `output_dtype` quantization down to int8 (4× smaller) or
binary (32× smaller). Check the specific model's page before assuming an older Voyage
model supports either knob.

The practical reading: dimension count is a storage/speed knob, not a quality
identity — and at a few thousand documents, storage is irrelevant, so default to the
strongest model at moderate dimensions and stop thinking about it. Model choice
matters more than dimension choice, and neither matters as much as chunking or
hybrid search. Re-run your recall@k eval when you switch models; embeddings from
different models are not comparable, so a switch means a full re-index.

## The cheap wins nobody starts with

**Metadata filtering.** The cheapest precision improvement available: filter before
you search. Extract `project_type`, `trade`, `year`, `contract_form` per quote at
index time, and a query about a G702/G703 progress billing never even scores
residential handyman quotes. Every serious vector store supports pre-filtering;
exact-match on a field beats any amount of embedding cleverness for the fields you
have.

**Query rewriting.** The incoming request is a rambling email; your index is tidy
quote chunks. One cheap LLM call rewriting the email into a search-shaped query
("commercial TPO re-roof, ~12,000 sq ft, includes tear-off") closes the register
gap between query and corpus. Expansion is the same trick pluralized: generate 2–3
variant queries, retrieve for each, RRF-merge the results.

**HyDE** (Gao et al., arXiv 2212.10496) inverts the problem: have the model write a
*hypothetical* past quote answering the request, embed that fake document, and
search with its vector. Documents resemble documents more than queries resemble
documents; the encoder's dense bottleneck filters out the hallucinated details. The
paper shows it beating the unsupervised state-of-the-art retriever zero-shot, with
no labels or fine-tuning. Try it when query rewriting plateaus.

## When to skip the vector store

> [!NOTE] The 200k threshold
> Anthropic's guidance in the same post: under ~200,000 tokens of corpus (roughly
> 500 pages), skip RAG — put the whole corpus in the prompt and rely on prompt
> caching. A few hundred one-page quotes may sit under this line today. Build the
> eval set anyway; it tells you the day you cross it.

The other exit is agentic search: give Claude grep/read tools over the corpus and
let it search iteratively, the way Claude Code searches a repo. It costs more tokens
and more latency per query than a vector lookup, but it handles multi-hop questions
("find quotes similar to this one but where we got the job") that single-shot
retrieval structurally can't. The decision rule: vector store for one-shot lookup at
scale, long context for small corpora, agentic search for questions that require
reading and reasoning across documents.

Nothing above has been run against the quote-generator yet. When it is, the recall@k
numbers land here as a dated field note, and this chapter earns `stable`.

---
title: Multimodal
status: draft
verified: 2026-08-26
sources:
  - https://platform.claude.com/docs/en/build-with-claude/vision
  - https://platform.claude.com/docs/en/build-with-claude/vision-coordinates
  - https://platform.claude.com/docs/en/build-with-claude/pdf-support
  - https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
  - https://github.com/openai/whisper
  - https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer
  - https://developers.openai.com/api/docs/guides/speech-to-text
  - https://developers.openai.com/api/docs/guides/text-to-speech
---

Images and audio are engineering inputs with billing formulas, resize rules, and
structural blind spots — treat them as channels you verify and cost-control, not as
demos.

The Claude API accepts images and PDFs directly; it has no audio content block.
Anthropic's own OpenAI-compatibility docs confirm it explicitly rather than leaving
it to be inferred from an absent type: an `input_audio` block is accepted for
compatibility and then silently stripped before the request reaches Claude. Audio
enters your pipeline through a transcription step and leaves it through a synthesis
step, so the audio half of this chapter is about choosing those two components
well.

## Screenshots are a verification channel

An agent that can see its own output closes a loop that text-only verification
leaves open. For UI work, the move is a screenshot after every meaningful change:
`xcrun simctl io booted screenshot shot.png` on the iOS simulator, a headless
browser capture on the web, then the image goes back into the conversation and the
agent checks its work against what actually rendered — layout, truncation, dark
mode, the state the code claims to be in.

Put the image before the question. Claude performs best with an image-then-text
structure; the vision docs say so explicitly, and it matches the long-documents-
first rule from the Prompting chapter.

A screenshot is a claim about what the harness can see, not about what ships.
On one shipped iOS app, a `/sim-verify` ritual produced a green screenshot of a
broken-looking paywall because `simctl launch` bypasses Xcode's scheme machinery,
so the StoreKit configuration never attached — the harness had a structural blind
spot for an entire subsystem (2026-07-18). The rule it left behind: enumerate what your screenshot loop
structurally cannot see — permission dialogs, purchase sheets, gesture feel — and
route those to an explicit human device pass instead of letting a green image imply
coverage.

> [!PATTERN] Vision-as-judge for UI evals
> Screenshot diffing with a model grader. Capture a baseline screenshot per
> screen, re-capture after changes, and when a pixel diff exceeds a threshold,
> send both images — labelled `Image 1:` baseline, `Image 2:` current — to a
> cheap model with a rubric: "Is this an intentional change, a regression, or
> noise? Name the changed element." Pixel diffs alone flag anti-aliasing and
> timestamps; a model grader reads the diff the way a reviewer would, and its
> verdict slots straight into the harness described in the Evals chapter. Grade
> with a schema (`verdict`, `changed_elements`, `confidence`) so the result is
> machine-routable.

## How images are billed

Claude sees images as 28×28-pixel patches, one visual token each, so an image
costs `⌈width/28⌉ × ⌈height/28⌉` tokens. A 1000×1000 screenshot is 1,296 tokens —
about $6.48 per thousand images at Claude Opus 5's $5/MTok input rate.

Oversized images are downscaled before processing, aspect ratio preserved, which
caps the cost — but the cap depends on the model tier. Claude 4.7 and later are
high-resolution: 2576 px max long edge, 4,784 visual tokens max. Everything older
is standard tier: 1568 px and 1,568 tokens. The same 4K frame costs 1,560 tokens
on a standard-tier model and 4,784 on a high-resolution one.

> [!CAUTION] The high-resolution tier tripled your screenshot bill
> A 1920×1080 screenshot that cost 1,560 tokens on older models costs 2,691 on
> Claude 4.7+ because it no longer gets downscaled. High-resolution ingestion is
> automatic — no opt-in, no header. In a screenshot-per-step agent loop where
> every turn resends history, this compounds; downsample to ~1092 px long edge
> before sending unless the task needs dense-text fidelity. See Cost and latency
> for the resend arithmetic.

The limits worth knowing: 10 MB per image base64 on the Claude API (5 MB on
Bedrock and Google Cloud), 600 images per request (100 for 200k-context models),
8000×8000 px max — and once a request carries more than 20 image blocks, a
stricter per-image cap kicks in; keep every image at or under 2000 px per side.
In multi-turn loops, base64 images are re-uploaded in the payload every turn;
upload once to the Files API and reference the `file_id` instead.

Two mechanics for coordinate work: Claude returns pixel coordinates relative to
the image *after* resizing, so pre-resize yourself if you need coordinates to land
on your original. And screenshots returned inside `tool_result` blocks to the
computer-use and browser-use toolsets are rejected with a validation error rather
than downscaled — your application owns that resize. To get the same fail-loud
behaviour on any other image block, set `"transformations": {"oversized_image":
"error"}` on it — the setting lives inside the `transformations` object, not as a
bare key.

## Extraction: vision versus OCR-then-parse

For messy layouts — receipts, scraped pages, multi-column PDFs, forms — send the
pixels. A vision call replaces three stages (OCR, layout reconstruction, parsing)
with one, and it is the layout-reconstruction stage that breaks on real-world
documents: OCR emits correct characters in scrambled reading order, and the parser
downstream inherits the scramble. The model reads the table *as a table*.

OCR-then-parse still wins in three cases: high-volume text-dense documents where
per-page image tokens dominate cost; verbatim fidelity requirements, because a
vision model can silently "correct" a typo that a compliance workflow needed
preserved; and anything leaning on precise counts — the vision docs are explicit
that counting is approximate and small low-quality text invites hallucination.

For PDFs you don't have to choose: a `document` content block gets you both. The
API converts each page to an image and extracts its text, and Claude reads the
pair — 1,500–3,000 text tokens per page plus the page-image cost, 32 MB per
request, 600 pages (100 when the context window is under 1M tokens).

> [!PATTERN] Schema plus image in one call
> Structured extraction straight from pixels: an `image` (or `document`) block in
> the message and a JSON schema in `output_config.format` in the same request.
> No intermediate prose to re-parse — the receipt goes in, typed line items come
> out, and `strict` schemas make the shape a guarantee rather than a hope. The
> Structured output chapter covers the schema mechanics. Ground the extraction by
> making every field nullable and instructing "use null for anything not visible
> in the image" — an extractor that can say null hallucinates less than one
> forced to fill every field. For multi-image requests, label each image
> (`Image 1:`, `Image 2:`) and have the schema carry a `source_image` field so
> every extracted fact points back at the pixels that support it.

## Audio out: TTS

Two tiers. Platform-native synthesis — `AVSpeechSynthesizer` on Apple platforms
(iOS 7+, macOS 10.14+) — is free, on-device, offline, and zero-latency to
integrate: an `AVSpeechUtterance`, a voice, a rate. API TTS — OpenAI's
`/v1/audio/speech` with `gpt-4o-mini-tts` is the reference point — buys naturalness
and steerability (an `instructions` parameter controls accent, intonation, pacing)
at the price of a network round-trip, per-character billing, and an outage mode
your offline app now owns.

> [!FIELD] 2026-08-25 — Ship the voice your users will actually hear
> A Japanese-learning app in this stack ships TTS through platform voices, and the quality question
> was settled by ear, not by spec sheet: the "fast" preset voices read N5
> vocabulary in a robotic cadence that a learner would imitate, and the
> "enhanced voice" upgrade path had already hit Apple's ceiling — a ruling that
> had to go into agent memory because the model kept re-inventing the idea
> (2026-08-25). In a pronunciation-sensitive domain, TTS review is a listening
> pass on real content by someone who can hear the errors; the harness lists
> "real TTS voices" as a permanent human device-pass item because no automated
> signal grades cadence.

## Audio in: STT

Whisper is the open-source reference: MIT-licensed, six sizes from `tiny` (39M
parameters, ~1 GB VRAM, ~10× speed) to `large` (1550M, ~10 GB), with `turbo`
(809M, ~8×) the practical default — a `large-v3` optimization with minimal
accuracy loss. One line gets you a local transcript: `whisper audio.m4a --model
turbo`. Hosted, OpenAI's `/v1/audio/transcriptions` takes files up to 25 MB;
`whisper-1` is the variant with word-level timestamps (`verbose_json` +
`timestamp_granularities`), the `gpt-4o-transcribe` family trades that for
accuracy and streaming, and `-diarize` adds speaker labels.

The on-device/API tradeoff is the same on both sides of the audio pipe. On-device
wins on privacy, offline operation, and zero marginal cost — decisive for a mobile
app with no backend. API wins on quality ceiling and on not owning model updates.
The asymmetry: STT output is an input to further processing, so its errors are
recoverable downstream; TTS output lands directly in the user's ear, so its
errors are the product. Spend your quality budget on the direction users hear.

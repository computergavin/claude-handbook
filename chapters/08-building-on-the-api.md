---
title: Building on the API
status: stub
verified: 2026-08-26
---

For the things that outgrow a Claude Code session and become software.

## The shape of a call

The Messages endpoint, streaming, and tool use. Verify current model IDs, limits, and
pricing against the docs rather than memory — this is the fastest-moving page in the
handbook.

*Sources to keep current:* https://docs.claude.com/en/api/overview

## Tool use

*To capture:* your patterns for tool definitions, result handling, and the retry
behaviour you settled on.

## Structured output

When you need JSON, say so unambiguously in the system prompt, strip code fences
defensively, and parse inside a try/catch. Assume the wrapper will occasionally
appear anyway.

## Batching and cost

*To capture:* where batch processing paid off, and your actual cost per unit of work.

## Agent SDK

Where a headless `-p` run stops being enough and the SDK's permission callbacks and
session control start earning their complexity.

*To capture:* the first project where you crossed that line.

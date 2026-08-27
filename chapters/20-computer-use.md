---
title: Computer use and browser agents
status: draft
verified: 2026-08-26
sources:
  - https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
  - https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool
  - https://platform.claude.com/docs/en/build-with-claude/vision
  - https://code.claude.com/docs/en/chrome
  - https://github.com/microsoft/playwright-mcp
  - https://claude.com/blog/claude-for-chrome
---

Driving a screen is the least reliable tool you can hand a model, so every
computer-use decision reduces to one rule: climb back up the abstraction ladder
until something stops you.

## The reliability ladder

Four ways to get data out of, or actions into, someone else's system, in
descending order of reliability:

1. **An official API.** Typed, versioned, rate-limited on purpose, and it fails
   loudly.
2. **Scraping a stable endpoint.** The JSON the page's own frontend fetches, an
   RSS feed, a sitemap. No session, no rendering, `curl`-testable.
3. **DOM and accessibility-tree automation.** Playwright, CDP, or the browser
   use toolset — acting on element references instead of pixels.
4. **Vision-based clicking.** Screenshot in, coordinates out. The computer use
   tool.

> [!PATTERN] Drop down only when the layer above is unavailable
> Before writing any browser agent, spend ten minutes in the network tab looking
> for the layer-2 endpoint. A job board that renders listings client-side is
> fetching them from somewhere; a lead source with no public API usually has an
> internal one. Every rung you climb removes an entire failure class: layer 2
> can't suffer selector drift, layer 3 can't misclick a moved button. The
> job-application and lead-scraper pipelines in this stack each started one rung
> lower than they run today — the first maintenance cycle is what teaches you the
> rung was wrong.

## The computer use tool: pixels and coordinates

The current tool is `computer_toolset_20260801` — no beta header — supported on
Claude Fable 5, Mythos 5, Opus 5, Sonnet 5, and Opus 4.8. Opus 4.7, Opus 4.6,
Sonnet 4.6, and Opus 4.5 support computer use only through the legacy beta
`computer_20251124`. You declare the toolset; Claude emits 17 member tool calls
(`screenshot`, `left_click`, `type`, `key`, `scroll`, `zoom`, and eleven
others); your executor performs them against a real display and returns
results with `"toolset_name": "computer"`. The loop is: screenshot, act,
screenshot, act, until Claude stops requesting tools.

Claude batches multiple actions per turn. Run them sequentially, stop at the
first failure, and return the exact halt text
`"Not executed: an earlier computer action in this turn failed."` with
`is_error: true` for everything after it. End each batch with a `screenshot` so
Claude observes the outcome without an extra round trip.

> [!CAUTION] Screenshots are the token bill
> An image costs `⌈width/28⌉ × ⌈height/28⌉` visual tokens — a 1024×768
> screenshot is ~1,036 tokens, and 4.7+ models accept up to 2576 px long edge
> and 4,784 tokens per image. The agent loop resends conversation history every
> turn, so a 20-step task carries twenty screenshots forward. Keep resolution at
> 1024×768–1366×768, use `zoom` on a region instead of raising global
> resolution, and prune old screenshots from history once Claude has acted on
> them.

The docs' own hardening list is the floor: dedicated VM or container, no
credentials in the environment, domain allowlist, human confirmation for
consequential actions. Note also that the API rejects oversized screenshots
returned to this toolset with a validation error instead of silently downscaling
— resize in your executor.

## Browsers deserve better than pixels

A browser is not an opaque screen; it will tell you its structure if you ask.
Three forms of the same idea:

**The browser use toolset** (`browser_toolset_20260801`, same models as
computer use) works through structure first. `read_page` returns the
accessibility tree with element references — `link "Getting started" [ref_2]`
— and Claude clicks by reference: `{"type": "ref", "ref": "ref_2"}`. References
survive layout shifts and reflows that break pixel coordinates. It adds
`find` (natural-language element search), `get_page_text`, `form_input`
(set a value directly instead of click-and-type), and tab management.
Screenshots remain available as the fallback for canvas UIs and cross-origin
iframes.

**Playwright MCP** (`claude mcp add playwright npx @playwright/mcp@latest`) is
the self-hosted equivalent for any agent: structured accessibility snapshots,
no vision model in the loop at all, deterministic element targeting.
Coordinate-based tools exist but are opt-in via `--caps=vision`.

**Claude in Chrome** is the packaged form for Claude Code: `claude --chrome`
with the extension installed connects your session to your real browser,
including its login state. Site-level permissions from the extension gate what
Claude can touch; it pauses and hands you the keyboard at login pages and
CAPTCHAs; in plan mode, read-only calls (`read_page`, `get_page_text`,
screenshots, console reads) run without prompts while clicks, typing, and
navigation require approval. See the MCP and tools chapter for where this sits
in the tool stack.

> [!PATTERN] Accessibility-tree-first prompting
> Instruct the agent to read before it looks: "use `read_page` with
> `filter: "interactive"` first; screenshot only when the tree is ambiguous."
> A filtered tree read of a typical page costs fewer input tokens than a
> ~1,000-token screenshot, returns references Claude can act on immediately, and
> is stable across the visual redesigns that silently break coordinate-based
> flows. The same trick works outside the browser toolset — dumping
> Playwright's accessibility snapshot into context as text gives any model a
> clickable map of the page for a fraction of the vision cost.

> [!PATTERN] Record then replay
> Let the agent explore a flow once — with browser tools, full deliberation,
> your review — then have it emit a deterministic Playwright script of what it
> did. The script runs on every subsequent execution at zero model cost; the
> agent is re-invoked only when the script's assertions fail, to re-explore and
> re-emit. This is the Field notes — Kaitaku master-log philosophy applied to
> browsers: when the same task repeats, the durable artifact is a script with
> assertions, not a resolution that the agent will "do it the same way" next
> time. A model in the loop is for the unknown; the known belongs in code.

## How browser agents fail

The failure modes are boring and you will hit all of them: selectors and
coordinates drift when the site ships a redesign; dynamic content renders after
the agent reads the page (wait for a specific element, never a fixed delay);
login walls and 2FA end autonomy — Claude in Chrome's answer, pausing for the
human, is the correct one to copy; and aggressive parallel fetching gets your
IP rate-limited or bot-flagged.

On the last point, stay descriptive rather than evasive: check for an official
API first, respect `robots.txt` and the site's terms, identify your client
honestly, and throttle to human-ish rates. A scraper that needs to disguise
itself is a signal you're on the wrong rung of the ladder — and an evasion arms
race is a maintenance treadmill you lose by default.

## Injection: the lethal trifecta with a UI

A browser agent holds all three legs from the Agent security chapter: it reads
untrusted content (every page), touches your private data (your logged-in
sessions), and can communicate externally (any form on the web). A hostile page
— or one hostile ad, or one hidden form field — is a prompt injection delivery
vehicle aimed at an agent that can act as you.

Anthropic's own red-teaming of Claude for Chrome puts numbers on it: 23.6% of
deliberate injection attacks succeeded in autonomous mode without mitigations,
11.2% with them, and a challenge set of four browser-specific attack types
(hidden DOM form fields, URL-text and tab-title injection) dropped from 35.7%
to 0% after targeted defenses. Read that as: mitigations work, and
the residual is still double digits. Architecture, not vigilance, is the
defense — assume the injection lands and limit what it finds.

## Gates and sandboxes

> [!WARNING] Submissions and purchases don't have an undo
> A submitted application, a completed purchase, a published post, a sent email
> — these are irreversible the moment the browser fires the request. Gate every
> such action on human confirmation: in Claude Code, a `PreToolUse` hook that
> blocks state-changing browser calls matching submit/checkout/send patterns
> (see the Hooks chapter — hooks survive bypass mode; instructions don't); on
> the API, an executor that returns "confirmation required" instead of
> performing the click. Claude for Chrome ships this shape as policy: purchases,
> publishing, and sharing personal data require explicit confirmation, and
> financial-services sites are blocked outright.

Run agent browsing in a profile that contains only what the task needs: a
dedicated Chrome profile (or Playwright's isolated context) with no saved
passwords, no payment methods, and sessions only for the sites the task
touches. Your daily profile — password manager, banking cookies, email — is
the trifecta's private-data leg fully loaded. The computer use docs say the
same thing at the OS level: a dedicated VM, minimal privileges, no credentials.
The cheapest sandbox is the login the agent never had.

Vision-based computer use is genuinely useful — for desktop apps, legacy UIs,
and the last rung when nothing else exists. Treat it like that: the tool of
last resort, wrapped in gates, running in a profile with nothing to lose.

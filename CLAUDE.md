# Working With Claude — handbook repo

A personal handbook on agentic engineering. Markdown chapters compile to one
self-contained HTML book via `build.py`.

## Build

```bash
python build.py            # build once
python build.py --watch    # rebuild on save
```

Never hand-edit `build/handbook.html`. It is generated. Edit `chapters/*.md`,
`assets/book.css`, or `assets/book.js` and rebuild.

## House rules for the prose

- **Assertions, not hedges.** "Hooks are deterministic" beats "hooks can be a good
  way to add determinism." If it needs a hedge, it needs a source or a test.
- **Lead with the claim.** No throat-clearing paragraph before the point.
- **Second person, present tense.** "Delegate when the task will generate volume."
- **No marketing register.** Never "powerful," "seamless," "unlock," "leverage,"
  "game-changing," "revolutionize."
- **Every chapter opens with the one-sentence version** of what it's about, then
  earns the detail.
- **Concrete over abstract.** Real config, real commands, real numbers.
- **American spelling throughout.** behavior, defense, summarize, labeled —
  never the British forms. Direct quotes keep their source's spelling.

## Structural rules

- Chapters get front matter: `title`, `status`, `verified`, optional `sources`.
- `verified` is an ISO date and must be updated whenever claims are re-checked.
  Never bump it without actually re-checking.
- Facts about Claude Code, the API, or Claude.ai are verified against primary docs
  before they go in. Cite the URL in `sources`. Blog posts are leads, not sources.
- New chapters must be registered in `book.json` or they will not render.
- Section headings (`##`) auto-number into the margin rail. Don't number manually.

## Callout semantics — enforced, not stylistic

| Callout | Means |
|---|---|
| `WARNING` | irreversible: data loss, destroyed branches, published mistakes |
| `CAUTION` | costs tokens, context, or correctness |
| `NOTE` | information |
| `PATTERN` | a named reusable technique |
| `FIELD` | learned the hard way on a real project, always dated |

Do not use `WARNING` for things that are merely expensive. The distinction is the
point of the system.

## Design

The visual direction is an orange wireframe notebook: graph-paper ground, white
sheets with a hard offset shadow, die-cut index tabs, margin rail for procedure
numbers. All color and type decisions live in `:root` in `assets/book.css`. Change
tokens there rather than adding one-off rules.

## Compact instructions

When summarising this conversation, preserve: chapter edits and why they were made,
any source URL that was verified, and any correction to a previously stated fact.
Drop build output and formatting chatter.

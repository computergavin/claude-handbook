# Working With Claude

**Read it: https://computergavin.github.io/claude-handbook/**

A living handbook. Markdown chapters in, one self-contained HTML book out.

```bash
pip install -r requirements.txt
python build.py --serve     # http://localhost:8000/
python build.py --watch     # rebuild on save
```

**PDF:** open the built file in Chrome → Print → enable *Background graphics* →
Save as PDF. The print stylesheet breaks pages per chapter and drops the search bar.

## Layout

```
book.json            chapter order + cover metadata
chapters/*.md        the book — front matter + markdown
assets/book.css      the design
assets/book.js       client-side search (indexes the DOM at load)
build.py             renderer
index.html           output — one file, no external assets except webfonts
                     (published as-is; build/handbook.html redirects here)
.claude/             skills, subagents and hooks for maintaining the book
```

## Chapter front matter

```yaml
---
title: Hooks
status: stable | draft | stub | experimental
verified: 2026-08-26
sources:
  - https://code.claude.com/docs/en/hooks-guide
---
```

`verified` is load-bearing: the build prints a warning for any chapter untouched in
90 days. These tools ship weekly and a confident stale page is worse than a gap.

## Callouts

```markdown
> [!WARNING] Irreversible
> Data loss, destroyed branches, published mistakes.
```

`WARNING` irreversible · `CAUTION` costs tokens or correctness · `NOTE` information ·
`PATTERN` a reusable move · `FIELD` learned on a real project.

## Maintaining it

- `/new-chapter <topic>` — scaffold a chapter and register it
- `/capture-lesson` — file whatever just happened as a dated field note
- `handbook-researcher` subagent — re-verify a chapter against primary sources
- `/handbook-audit <path>` — audit a repo's Claude-workflow setup against the book

## License

The book (`chapters/`, `book.json`, the rendered `index.html`) is
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — quote it, adapt it,
translate it, sell it, just credit it. The machinery (`build.py`, `assets/`,
`.claude/`) is MIT. Material quoted from Anthropic's docs or any other cited
source belongs to its owner and is not relicensed by either. See [LICENSE](LICENSE).

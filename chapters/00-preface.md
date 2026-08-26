---
title: How to use this handbook
status: stable
verified: 2026-08-26
---

This is a working manual, not a tutorial. It exists because the same lessons kept
getting re-learned across projects and then lost when the session ended.

Three rules govern what goes in it.

**Nothing goes in until it has been run.** A pattern earns a page after it has
worked on real code — not after it looked good in a blog post. Anything borrowed
from outside gets marked with its source and treated as untested until it isn't.

**Every chapter carries a date.** These tools ship weekly. A handbook that hides
its own age is worse than no handbook, because it converts stale information into
confident information. The build prints a warning for anything unverified in 90 days.

**Corrections beat additions.** The most valuable page is the one that says "this
used to be true." When a pattern stops working, amend the chapter rather than
starting a new one.

## The four signals

The callouts throughout use the conventions of a service manual, because the
distinction they encode is real: some mistakes cost a repository, some only cost
tokens.

> [!WARNING] Irreversible
> Data loss, destroyed branches, published mistakes. Read before running.

> [!CAUTION] Costs something
> Burns tokens, floods context, or quietly degrades output quality.

> [!NOTE] Information
> Useful but not load-bearing.

> [!PATTERN] A reusable move
> A named technique worth reaching for deliberately.

> [!FIELD] Learned on a real project
> Something that only became obvious after it went wrong.

## Building it

```bash
pip install -r requirements.txt
python build.py --serve     # http://localhost:8000/handbook.html
python build.py --watch     # rebuild on every save
```

To make a PDF: open the built file in Chrome, print, background graphics on,
margins default. The print stylesheet handles chapter breaks and drops the screen
chrome.

## Adding to it

Two slash commands do the routine work:

- `/new-chapter <topic>` scaffolds a chapter with front matter and registers it in
  `book.json`.
- `/capture-lesson` takes whatever just happened in the session and files it into
  the right chapter as a field note.

The second one is the point. The handbook is only worth maintaining if capturing a
lesson costs less effort than forgetting it.

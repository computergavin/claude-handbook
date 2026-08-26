---
name: new-chapter
description: Scaffold a new handbook chapter with front matter and register it in
  book.json. Use when the user wants to add a chapter, section, or topic to the
  handbook.
---

# New chapter

1. Read `book.json` to see existing chapters and pick the filename: `NN-slug.md`
   matching the position it should occupy. If it slots into the middle, renumber the
   files after it and update `book.json` in the same pass.

2. Create `chapters/NN-slug.md`:

```markdown
---
title: <Title case, no numbering>
status: stub
verified: <today, ISO>
sources:
---

<One sentence saying what this chapter is about. No preamble before it.>

## <First section>

*To capture:* <the specific question the next project will ask about this topic>
```

3. Register the filename in `book.json` in the right position.

4. Run `python build.py` and report the new chapter count.

Do not write the content unless asked. A stub with sharp questions in it beats filler
prose, because filler looks finished and stops anyone returning to it.

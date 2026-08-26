---
name: capture-lesson
description: File something learned in the current session into the handbook as a
  dated field note. Use when the user says to capture, record, or write down a
  lesson, or after debugging something that took real effort.
---

# Capture lesson

The handbook is only worth maintaining if capturing costs less than forgetting. Keep
this fast.

1. **Identify the lesson.** From this session, not from general knowledge. If nothing
   here was actually learned the hard way, say so and stop. A handbook padded with
   things that were always obvious is one nobody rereads.

2. **Pick the destination.** Read `book.json`, then the front matter of the two or
   three likeliest chapters. Prefer amending an existing chapter over creating one.
   Project-specific lessons go in that project's field-notes chapter.

3. **Write it as a field note**, at the end of the relevant section:

```markdown
> [!FIELD] <Short name for the failure mode> — <ISO date>
> **What happened.** One or two sentences.
>
> **Why.** The mechanism, not the blame.
>
> **What changed.** The hook, instruction, subagent, or habit that now prevents it.
```

4. **Check the layer.** If the fix was an instruction that must hold every time, say
   so plainly: it should be a hook instead, and the note should say why the
   instruction was insufficient.

5. **Update `verified`** on that chapter only if you actually re-checked its claims.
   Adding a note is not verification.

6. Rebuild and report which chapter grew.

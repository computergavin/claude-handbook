---
title: Appendix
status: stub
verified: 2026-08-26
---

## Hook events, quick reference

`SessionStart` · `Setup` · `UserPromptSubmit` · `UserPromptExpansion` · `PreToolUse`
· `PermissionRequest` · `PermissionDenied` · `PostToolUse` · `PostToolUseFailure` ·
`PostToolBatch` · `Notification` · `MessageDisplay` · `SubagentStart` ·
`SubagentStop` · `TaskCreated` · `TaskCompleted` · `Stop` · `StopFailure` ·
`TeammateIdle` · `InstructionsLoaded` · `ConfigChange` · `CwdChanged` ·
`DirectoryAdded` · `FileChanged` · `WorktreeCreate` · `WorktreeRemove` ·
`PreCompact` · `PostCompact` · `Elicitation` · `ElicitationResult` · `SessionEnd`

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No objection. Not an approval for `PreToolUse` |
| 2 | Block. stderr becomes the reason |
| other | Depends on stdout; usually a non-blocking error |

## Timeouts

`command` / `http` / `mcp_tool` 10 min · `prompt` 30 s · `agent` 60 s ·
`UserPromptSubmit` 30 s · `MessageDisplay` 10 s · `SessionEnd` 1.5 s shared budget

## Primary sources

- https://code.claude.com/docs/llms.txt — full docs index
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/agent-teams
- https://docs.claude.com/en/api/overview

## Revision log

| Date | Change |
|---|---|
| 2026-08-26 | First edition assembled |

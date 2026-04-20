---
"@inkeep/agents-manage-ui": minor
---

Recognize `{{$conversation.id}}` in the Monaco prompt editor. Lint no longer marks it as "Unknown variable" and autocomplete surfaces `$conversation.id` when the author types `{{$`. Gated on no config — works in any agent prompt.

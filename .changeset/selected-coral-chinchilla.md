---
"@inkeep/agents-manage-ui": patch
---

Fix inconsistent conversation trace timing. Anchor the user-message event at the request-arrival span start (matching the conversation list and TTFT) instead of a mid-handler timestamp, and stop labeling the user-message row with the whole-request span duration, so time-to-first-token, conversation duration, and the message event no longer contradict each other.

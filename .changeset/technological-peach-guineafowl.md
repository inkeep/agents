---
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
---

Drop FK constraints on events.conversation_id and events.message_id so events fired before their anchor rows exist (e.g. first user_message_submitted of a conversation) are not silently dropped. Conversation deletion still removes associated events via explicit app-level cleanup.

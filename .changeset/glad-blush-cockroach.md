---
"@inkeep/agents-core": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-cli": patch
"@inkeep/agents-sdk": patch
"@inkeep/create-agents": patch
---

Refresh model lineup against current vendor status:

- Gemini: add `GEMINI_3_1_FLASH_LITE` (GA) and `GEMINI_3_5_FLASH` (GA); drop `Gemini 3 Flash` (does not exist in Google's API) and `Gemini 3 Pro Preview` (shut down 2026-03-09) from the manage-UI and CLI pickers; swap `Gemini 3.1 Flash Lite Preview` for the GA in pickers.
- Anthropic: add `CLAUDE_OPUS_4_7` (current Opus flagship); drop `Claude Opus 4` and `Claude Sonnet 4` (deprecated 2026-04-14, retire 2026-06-15) from pickers.
- OpenAI: migrate the OpenAI summarizer default from `GPT_4_1_NANO` (retires 2026-10-23) to `GPT_5_4_NANO` across the manage-UI, CLI, agents-sdk example, and create-agents template; drop `GPT-4.1 Nano` from pickers.

Constants for sunset/preview model IDs are retained so existing SDK consumers continue to compile.

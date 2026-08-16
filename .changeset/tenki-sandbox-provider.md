---
'@inkeep/agents-api': patch
---

Add Tenki as a sandbox provider for function tool execution. Configure it with `sandboxConfig: { provider: 'tenki', ... }` or by setting `SANDBOX_TENKI_API_KEY` in the environment; function tools then run in isolated Tenki Sandbox microVMs with pooled sessions, matching the existing Vercel provider behavior.

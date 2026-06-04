---
"@inkeep/agents-core": patch
---

Fix SSO provider issuer edits not refreshing OIDC discovery and cached endpoints; the update path now re-runs discovery server-side when the issuer changes

---
'@inkeep/agents-manage-ui': patch
---

Fix authentication return URL validation to reject backslash-based redirect bypasses that could send users off-site after login.

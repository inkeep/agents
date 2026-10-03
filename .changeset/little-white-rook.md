---
"@inkeep/create-agents": patch
---

Improve dependency installation for new projects by checking first that the pnpm on PATH can run the project's pinned pnpm version. When it cannot, create-agents stops before installing and shows how to install the pinned version.

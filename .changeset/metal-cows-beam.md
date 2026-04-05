---
"@inkeep/agents-manage-ui": patch
---

fix `Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component happens to re-render.

---
"@inkeep/agents-manage-ui": patch
---

remove `forwardRef` usages. In React 19, `forwardRef` is no longer necessary. Pass `ref` as a prop instead.

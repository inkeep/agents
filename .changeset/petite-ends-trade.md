---
"@inkeep/agents-api": patch
---

Add artifact and tool result passing as tool arguments

Agents can now pass saved artifacts directly to tools as arguments without reconstructing data manually. The system automatically resolves full artifact data — including non-preview fields — before the tool executes.

Agents can also chain tool calls by passing the raw output of one tool directly into the next, with no artifact creation required for intermediate results. Primitive return types (strings, numbers, booleans) are fully supported for chaining.

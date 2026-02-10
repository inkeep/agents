---
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-core": patch
---

Fix nested error message display in form validation

- Add `firstNestedMessage` helper to recursively extract error messages from nested Zod validation objects
- Display error path location (e.g., `→ at ["foo", "bar"]`) for deeply nested validation errors
- Refactor `createCustomHeadersSchema` to use Zod `.pipe()` for cleaner error path propagation
- Rename `HeadersSchema` to `StringRecordSchema` for broader applicability

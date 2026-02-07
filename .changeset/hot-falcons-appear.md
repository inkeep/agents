---
"@inkeep/agents-manage-ui": patch
---

Improve form component type inference from Zod schemas with transformed values. This ensures proper TypeScript types flow through form fields when using Zod's `.transform()` methods. Also adds `isRequired` and `serializeJson` utility functions for form validation.

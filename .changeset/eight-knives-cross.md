---
"@inkeep/agents-manage-ui": patch
---

- Replace prop-drilled permission flags (`readOnly`, `canEdit`, `canUse`, `canManage`) with direct consumption via `useProjectPermissionsQuery()` hook in client components
- Fix empty breadcrumb on `/[tenantId]/profile` page

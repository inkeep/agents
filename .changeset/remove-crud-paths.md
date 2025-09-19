---
"@inkeep/agents-manage-api": minor
"@inkeep/agents-manage-ui": minor
"@inkeep/agents-cli": minor
"@inkeep/agents-sdk": minor
---

Remove 'crud' from all API endpoint paths

**BREAKING CHANGE**: API endpoints no longer include `/crud/` in their paths.

## Migration Guide

Update all API calls by removing `/crud/` from endpoint paths:

- **Before**: `/tenants/{tenantId}/crud/projects/{projectId}/...`
- **After**: `/tenants/{tenantId}/projects/{projectId}/...`

## Changes

- Removed `/crud/` segment from all manage-api route definitions
- Updated all API client code in manage-ui, cli, and SDK packages
- Cleaned up OpenAPI tags to remove "CRUD" prefix
- All internal references and tests updated

This change simplifies API paths and makes them more RESTful.
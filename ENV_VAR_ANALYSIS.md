# Environment Variable Analysis: API URL Configuration

## Overview

The codebase uses multiple environment variables to configure API URLs, creating complexity around naming conventions and usage contexts. This document analyzes the current state and proposes simplification strategies.

## Current Environment Variables

### Manage API URLs

1. **`AGENTS_MANAGE_API_URL`**
   - **Usage**: Internal server-side usage within `agents-manage-api` service
   - **Location**: `agents-manage-api/src/env.ts`
   - **Default**: `http://localhost:3002`
   - **Used For**:
     - OpenAPI schema generation (`agents-manage-api/src/openapi.ts`)
     - OAuth redirect URL construction (`agents-manage-api/src/utils/oauth-service.ts`)
     - Self-referencing URLs in agent data (`agents-manage-api/src/data/agentFull.ts`)

2. **`INKEEP_AGENTS_MANAGE_API_URL`**
   - **Usage**: External client-side/server-side usage by clients connecting TO the manage API
   - **Default**: `http://localhost:3002`
   - **Used For**:
     - CLI tool (`agents-cli/`)
     - SDK/TypeScript packages (`packages/agents-core/src/context/ContextConfig.ts`)
     - UI server-side API calls (`agents-manage-ui/src/lib/api/api-config.ts`)
     - Docker compose internal networking (`docker-compose.yml`)

3. **`PUBLIC_INKEEP_AGENTS_MANAGE_API_URL`**
   - **Usage**: Client-side browser usage in Next.js UI
   - **Location**: `agents-manage-ui/src/app/layout.tsx` (runtime config)
   - **Default**: `http://localhost:3002`
   - **Used For**:
     - Browser-based API calls from React components
     - OAuth login URL generation (`agents-manage-ui/src/lib/utils/mcp-urls.ts`)
     - Runtime configuration passed to React components

### Run API URLs

1. **`AGENTS_RUN_API_URL`**
   - **Usage**: Internal server-side usage within `agents-run-api` service
   - **Location**: `agents-run-api/src/env.ts`
   - **Default**: `http://localhost:3003`
   - **Used For**:
     - OpenAPI schema generation (`agents-run-api/src/openapi.ts`)

2. **`INKEEP_AGENTS_RUN_API_URL`**
   - **Usage**: External client-side/server-side usage by clients connecting TO the run API
   - **Default**: `http://localhost:3003`
   - **Used For**:
     - CLI tool (`agents-cli/`)
     - AI SDK Provider (`packages/ai-sdk-provider/src/inkeep-provider.ts`)
     - SDK/TypeScript packages
     - Docker compose internal networking

3. **`PUBLIC_INKEEP_AGENTS_RUN_API_URL`**
   - **Usage**: Client-side browser usage in Next.js UI
   - **Location**: `agents-manage-ui/src/app/layout.tsx` (runtime config)
   - **Default**: `http://localhost:3003`
   - **Used For**:
     - Browser-based API calls from React components
     - Chat widget configuration (`agents-manage-ui/src/components/agent/playground/chat-widget.tsx`)
     - SDK integration guides (`agents-manage-ui/src/components/agent/ship/*.tsx`)
     - MCP guide URLs (`agents-manage-ui/src/components/agent/ship/mcp-guide/mcp-guide.tsx`)

## Usage Patterns

### Pattern 1: Internal Self-Reference
**Variables**: `AGENTS_MANAGE_API_URL`, `AGENTS_RUN_API_URL`
- Used by services to reference themselves
- Typically for OpenAPI schemas and OAuth redirect URLs
- Never exposed to clients

### Pattern 2: External Server-Side
**Variables**: `INKEEP_AGENTS_MANAGE_API_URL`, `INKEEP_AGENTS_RUN_API_URL`
- Used by Node.js/CLI tools to connect to APIs
- Used in Docker networking (container-to-container)
- Used in SDK packages

### Pattern 3: External Client-Side (Browser)
**Variables**: `PUBLIC_INKEEP_AGENTS_MANAGE_API_URL`, `PUBLIC_INKEEP_AGENTS_RUN_API_URL`
- Used in Next.js runtime config for browser code
- Exposed to client-side JavaScript
- Must be publicly accessible URLs

## Docker Compose Complexity

The `docker-compose.yml` file reveals the complexity:

```yaml
inkeep-agents-manage-ui:
  environment:
    - PUBLIC_INKEEP_AGENTS_MANAGE_API_URL=${PUBLIC_INKEEP_AGENTS_MANAGE_API_URL:-http://localhost:3002}
    - INKEEP_AGENTS_MANAGE_API_URL=${INKEEP_AGENTS_MANAGE_API_URL:-http://host.docker.internal:3002}
```

**Key Insight**: 
- `PUBLIC_INKEEP_AGENTS_MANAGE_API_URL` uses `localhost` (for browser access from host)
- `INKEEP_AGENTS_MANAGE_API_URL` uses `host.docker.internal` (for server-side container access)

This dual configuration is necessary because:
1. Browser code runs on the host machine and needs `localhost`
2. Server-side code runs in the container and needs `host.docker.internal`

## Problems with Current Approach

1. **Naming Inconsistency**: Two different prefixes (`AGENTS_*` vs `INKEEP_AGENTS_*`) for similar purposes
2. **Confusion**: Developers must understand which variable to use in which context
3. **Maintenance Burden**: Multiple variables to update when URLs change
4. **Documentation Overhead**: Must document all variants and their use cases
5. **Docker Complexity**: Different defaults for same logical URL based on context

## Recommendations for Simplification

### Option 1: Standardize on `INKEEP_AGENTS_*` Prefix (Recommended)

**Rationale**: `INKEEP_AGENTS_*` is more widely used and aligns with external-facing naming conventions.

**Changes Required**:

1. **Rename internal variables**:
   - `AGENTS_MANAGE_API_URL` → `INKEEP_AGENTS_MANAGE_API_URL` (in manage-api)
   - `AGENTS_RUN_API_URL` → `INKEEP_AGENTS_RUN_API_URL` (in run-api)

2. **Consolidate usage**:
   - Use `INKEEP_AGENTS_MANAGE_API_URL` for both internal and external server-side usage
   - Keep `PUBLIC_INKEEP_AGENTS_MANAGE_API_URL` for browser/client-side only

3. **Update files**:
   - `agents-manage-api/src/env.ts`
   - `agents-manage-api/src/openapi.ts`
   - `agents-manage-api/src/utils/oauth-service.ts`
   - `agents-manage-api/src/data/agentFull.ts`
   - `agents-run-api/src/env.ts`
   - `agents-run-api/src/openapi.ts`

**Benefits**:
- Single naming convention
- Clearer distinction: `INKEEP_AGENTS_*` (server-side) vs `PUBLIC_INKEEP_AGENTS_*` (client-side)
- Less confusion for developers

**Migration Path**:
1. Add support for both names temporarily (with deprecation warnings)
2. Update all code to use new names
3. Remove old names after deprecation period

### Option 2: Keep Current Structure, Improve Documentation

**Rationale**: Current structure works but needs better documentation and tooling.

**Changes Required**:

1. **Create environment variable reference documentation**
2. **Add validation/warnings** when wrong variable is used in wrong context
3. **Create helper functions** that automatically select correct variable based on context

**Benefits**:
- No breaking changes
- Maintains current flexibility
- Better developer experience through tooling

**Drawbacks**:
- Still maintains complexity
- Requires ongoing maintenance

### Option 3: Single Variable with Context-Aware Resolution

**Rationale**: Use one variable name, resolve based on runtime context.

**Changes Required**:

1. **Create utility functions**:
   ```typescript
   // In shared package
   export function getManageApiUrl(context: 'server' | 'client'): string {
     if (context === 'client') {
       return process.env.PUBLIC_INKEEP_AGENTS_MANAGE_API_URL || 
              process.env.INKEEP_AGENTS_MANAGE_API_URL || 
              'http://localhost:3002';
     }
     return process.env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002';
   }
   ```

2. **Update all code** to use utility functions instead of direct env access

**Benefits**:
- Single source of truth
- Automatic fallback logic
- Easier to maintain

**Drawbacks**:
- Requires refactoring all usage sites
- More abstraction layer

## Recommended Approach: Hybrid of Option 1 + Option 3

### Phase 1: Standardize Naming (Option 1)
- Rename `AGENTS_*` → `INKEEP_AGENTS_*`
- Update all internal usage
- Add deprecation warnings for old names

### Phase 2: Add Utility Functions (Option 3)
- Create shared utility functions for URL resolution
- Gradually migrate code to use utilities
- Maintain backward compatibility during transition

### Final State

**Environment Variables**:
- `INKEEP_AGENTS_MANAGE_API_URL` - Server-side (default: `http://localhost:3002`)
- `PUBLIC_INKEEP_AGENTS_MANAGE_API_URL` - Client-side (default: `http://localhost:3002`)
- `INKEEP_AGENTS_RUN_API_URL` - Server-side (default: `http://localhost:3003`)
- `PUBLIC_INKEEP_AGENTS_RUN_API_URL` - Client-side (default: `http://localhost:3003`)

**Usage Pattern**:
```typescript
// Server-side code
import { getManageApiUrl } from '@inkeep/agents-core';
const url = getManageApiUrl('server'); // Uses INKEEP_AGENTS_MANAGE_API_URL

// Client-side code (browser)
import { getManageApiUrl } from '@inkeep/agents-core';
const url = getManageApiUrl('client'); // Uses PUBLIC_INKEEP_AGENTS_MANAGE_API_URL
```

## Implementation Checklist

- [ ] Update `agents-manage-api/src/env.ts` to use `INKEEP_AGENTS_MANAGE_API_URL`
- [ ] Update `agents-run-api/src/env.ts` to use `INKEEP_AGENTS_RUN_API_URL`
- [ ] Update all internal references in manage-api
- [ ] Update all internal references in run-api
- [ ] Create utility functions in `packages/agents-core`
- [ ] Update documentation
- [ ] Update docker-compose.yml examples
- [ ] Add deprecation warnings for old variable names
- [ ] Create migration guide for users

## Docker Compose Considerations

The docker-compose.yml will still need both variables for the UI service:

```yaml
inkeep-agents-manage-ui:
  environment:
    # Browser code (runs on host) - needs localhost
    - PUBLIC_INKEEP_AGENTS_MANAGE_API_URL=http://localhost:3002
    # Server code (runs in container) - needs host.docker.internal
    - INKEEP_AGENTS_MANAGE_API_URL=http://host.docker.internal:3002
```

This is unavoidable due to the dual nature of Next.js (SSR + client-side).

## Summary

The current environment variable setup creates unnecessary complexity through inconsistent naming. Standardizing on `INKEEP_AGENTS_*` prefix and adding utility functions will reduce confusion while maintaining the necessary distinction between server-side and client-side usage.


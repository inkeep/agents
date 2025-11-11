# Agents SDK Type Usage Analysis

## Summary

The `agents-sdk` package is **mostly** utilizing reusable types/schemas from the `agents-core` package correctly, but there are **2 key issues** that need to be addressed:

1. **Duplicate `MCPToolConfig` definition** - Creates potential type conflicts
2. **Unused `FetchDefinitionConfig`** - Dead code that should use core's `FetchDefinition`

## ✅ Correct Usage

The SDK correctly imports and uses these types from `@inkeep/agents-core`:

- ✅ `ModelSettings` - Correctly imported and re-exported
- ✅ `AgentStopWhen` - Correctly imported
- ✅ `StatusUpdateSettings` - Correctly imported  
- ✅ `AgentConversationHistoryConfig` - Correctly imported
- ✅ `McpTransportConfig` - Correctly imported
- ✅ `CredentialReferenceApiInsert` - Correctly imported
- ✅ `ArtifactComponentApiInsert` - Correctly imported
- ✅ `DataComponentApiInsert` - Correctly imported
- ✅ `SubAgentApiInsert` - Correctly imported
- ✅ `ToolInsert` - Correctly imported
- ✅ `FullAgentDefinition` - Correctly imported
- ✅ `FullProjectDefinition` - Correctly imported
- ✅ `FunctionToolConfig` - Correctly imported and re-exported

## ❌ Issues Found

### Issue 1: Duplicate `MCPToolConfig` Definition

**Location:** `packages/agents-sdk/src/types.ts:134-148`

**Problem:**
```typescript
// In agents-sdk/src/types.ts
export interface MCPToolConfig {
  id: string;
  name: string;
  tenantId?: string;
  description?: string;
  credential?: CredentialReferenceApiInsert;
  server?: ServerConfig;
  serverUrl: string;
  toolName?: string;
  activeTools?: string[];
  headers?: Record<string, string>;
  mcpType?: 'nango' | 'generic';
  transport?: McpTransportConfig;
  imageUrl?: string;
}
```

**Core Definition:** `packages/agents-core/src/types/entities.ts:209`
```typescript
export type MCPToolConfig = z.infer<typeof MCPToolConfigSchema>;
```

**Impact:**
- The SDK's `types.ts` exports `MCPToolConfig` as an interface
- The core package exports `MCPToolConfig` as a type (inferred from Zod schema)
- Since `index.ts` does `export type * from './types'`, this creates a type conflict
- However, actual code imports correctly from core (see `builderFunctions.ts:4`, `tool.ts:1`)

**Recommendation:**
- Remove the duplicate `MCPToolConfig` interface from `types.ts`
- Re-export the type from core: `export type { MCPToolConfig } from '@inkeep/agents-core';`

### Issue 2: Unused `FetchDefinitionConfig`

**Location:** `packages/agents-sdk/src/types.ts:150-163`

**Problem:**
```typescript
export interface FetchDefinitionConfig {
  id: string;
  name?: string;
  trigger: 'initialization' | 'invocation';
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  transform?: string;
  responseSchema?: z.ZodSchema<any>;
  defaultValue?: unknown;
  timeout?: number;
  credential?: CredentialReferenceApiInsert;
}
```

**Core Equivalent:** `packages/agents-core/src/types/entities.ts:242`
```typescript
export type FetchDefinition = z.infer<typeof FetchDefinitionSchema>;
```

**Differences:**
- `FetchDefinitionConfig` has `url` directly
- `FetchDefinition` has `fetchConfig: { url, ... }` (nested structure)
- `FetchDefinitionConfig` has `responseSchema?: z.ZodSchema<any>`
- `FetchDefinition` has `responseSchema?: any` (JSON Schema)

**Impact:**
- `FetchDefinitionConfig` is defined but **never used** in the SDK codebase
- This appears to be dead code
- The core's `FetchDefinition` is the canonical type

**Recommendation:**
- Remove `FetchDefinitionConfig` if unused
- If SDK needs a different structure, document why and ensure it's actually used
- Otherwise, use `FetchDefinition` from core

## Files Using Core Types Correctly

1. ✅ `packages/agents-sdk/src/tool.ts` - Imports `MCPToolConfig` from core
2. ✅ `packages/agents-sdk/src/builderFunctions.ts` - Imports `MCPToolConfig` and `MCPToolConfigSchema` from core
3. ✅ `packages/agents-sdk/src/types.ts` - Imports most types from core correctly
4. ✅ `packages/agents-sdk/src/agent.ts` - Uses core types
5. ✅ `packages/agents-sdk/src/project.ts` - Uses core types
6. ✅ `packages/agents-sdk/src/subAgent.ts` - Uses core types

## Recommendations

1. **Remove duplicate `MCPToolConfig`** from `types.ts` and re-export from core
2. **Remove unused `FetchDefinitionConfig`** or document why it exists if needed
3. **Add type checking** to catch these issues in CI/CD
4. **Consider using `export type`** for re-exports to avoid value/type conflicts

## Verification Steps

To verify fixes:
1. Remove duplicate definitions
2. Run `pnpm --filter @inkeep/agents-sdk typecheck`
3. Run `pnpm --filter @inkeep/agents-sdk test`
4. Check that all imports resolve correctly

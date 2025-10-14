# Sandbox Config - Application Level Implementation

## Summary

Sandbox configuration is now an **application-level** setting passed to `createExecutionApp()`, not a **project-level** setting stored in the database. This makes sandbox provider selection a deployment decision rather than a project configuration.

## Rationale

Sandbox providers (local vs vercel) are **runtime/deployment concerns**, not project data:

- Local provider: self-hosted deployments with process spawning
- Vercel provider: serverless platforms where process spawning isn't available

The choice of provider is tied to **where you deploy**, not what project you're working on.

## Changes Made

### 1. Added `sandboxConfig` to `createExecutionApp()`

```typescript
// agents-run-api/src/index.ts
export function createExecutionApp(config?: {
  serverConfig?: ServerConfig;
  credentialStores?: CredentialStore[];
  sandboxConfig?: {
    provider: "local" | "vercel";
    runtime: "node22" | "typescript";
    timeout?: number;
    vcpus?: number;
  };
});
```

### 2. Pass Through App Context

```typescript
// agents-run-api/src/app.ts
type AppVariables = {
  executionContext: ExecutionContext;
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  sandboxConfig?: {
    /* ... */
  }; // Added
  requestBody?: any;
};
```

### 3. Flow Through to Agent

**Route** → `getRegisteredAgent()` → `hydrateAgent()` → `createTaskHandlerConfig()` → `createTaskHandler()` → `Agent`

Each function in the chain now accepts and passes through `sandboxConfig`.

### 4. Agent Uses sandboxConfig from config

```typescript
// agents-run-api/src/agents/Agent.ts
export type AgentConfig = {
  // ... existing fields
  sandboxConfig?: SandboxConfig; // Added
};

// In getFunctionTools():
const result = await sandboxExecutor.executeFunctionTool(
  functionToolDef.id,
  args,
  {
    sandboxConfig: this.config.sandboxConfig || defaultSandboxConfig, // From config, not project
  }
);
```

### 5. Removed from Database

**Deleted**:

- `projects.sandboxConfig` column from database schema
- `sandboxConfig` from `ProjectInsertSchema`
- Project form UI for sandbox configuration

## Usage Examples

### Local Development

```typescript
import { createExecutionApp } from "@inkeep/agents-run-api";

const app = createExecutionApp({
  sandboxConfig: {
    provider: "local",
    runtime: "node22",
    timeout: 30000,
    vcpus: 1,
  },
});
```

### Production on Vercel

```typescript
const app = createExecutionApp({
  sandboxConfig: {
    provider: "vercel",
    runtime: "node22",
    timeout: 60000,
    vcpus: 4,
  },
});
```

### Default (No Config)

```typescript
const app = createExecutionApp();
// Uses default: { provider: 'local', runtime: 'node22', timeout: 30000, vcpus: 1 }
```

## Environment-Based Configuration

You can use environment variables to set different configs per deployment:

```typescript
const app = createExecutionApp({
  sandboxConfig: {
    provider: process.env.SANDBOX_PROVIDER === "vercel" ? "vercel" : "local",
    runtime: "node22",
    timeout: Number(process.env.SANDBOX_TIMEOUT) || 30000,
    vcpus: Number(process.env.SANDBOX_VCPUS) || 1,
  },
});
```

## Files Modified

### Backend

- ✅ `agents-run-api/src/index.ts` - Added `sandboxConfig` to `createExecutionApp()`
- ✅ `agents-run-api/src/app.ts` - Added to AppVariables, middleware
- ✅ `agents-run-api/src/agents/Agent.ts` - Added to AgentConfig, use instead of project config
- ✅ `agents-run-api/src/agents/generateTaskHandler.ts` - Added to TaskHandlerConfig, pass through
- ✅ `agents-run-api/src/data/agents.ts` - Updated `getRegisteredAgent()` and `hydrateAgent()`
- ✅ `agents-run-api/src/routes/agents.ts` - Get from context, pass to getRegisteredAgent()

### Core

- ✅ `packages/agents-core/src/db/schema.ts` - Removed `sandboxConfig` from projects table
- ✅ `packages/agents-core/src/validation/schemas.ts` - Removed from `ProjectInsertSchema`

### SDK

- ✅ `packages/agents-sdk/src/environment-settings.ts` - Removed sandboxConfig (user already did this)

### UI

- ✅ `agents-manage-ui/src/components/projects/form/project-sandbox-section.tsx` - Reverted by user

## Benefits

1. **Separation of Concerns**: Runtime configuration separate from project data
2. **Simpler Schema**: No database migration needed when changing sandbox providers
3. **Deployment Flexibility**: Different deployments can use different providers without DB changes
4. **Environment-Specific**: Easy to configure per environment (dev/staging/prod)
5. **No UI Needed**: Developers configure in code, not in UI forms

## Default Behavior

If no `sandboxConfig` is provided, the default is:

```typescript
{
  provider: 'local',
  runtime: 'node22',
  timeout: 30000,  // 30 seconds
  vcpus: 1,
}
```

This ensures backward compatibility - existing deployments continue to work with local sandboxes.

## Future Enhancements

Potential improvements:

1. **Config validation**: Validate that Vercel credentials are available when provider is 'vercel'
2. **Runtime switching**: Allow dynamic provider selection based on function requirements
3. **Metrics**: Track which provider is used for observability
4. **Multiple providers**: Support fallback providers (try Vercel, fallback to local)

## Testing

Type check passed:

```bash
cd agents-run-api && pnpm typecheck
# ✓ No errors
```

All changes are type-safe and backward compatible (defaults to 'local' provider).

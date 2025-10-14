# Vercel Sandbox Implementation Summary

## Overview

Implemented support for executing function tools in Vercel Sandbox MicroVMs as an alternative to the native (local) sandbox executor. This allows function tools to run in isolated cloud-based Linux VMs when the native executor cannot be used (e.g., on Vercel deployments where child process spawning is restricted).

## Changes Made

### 1. Type Definitions (`agents-run-api/src/types/execution-context.ts`)

Updated `SandboxConfig` to be a discriminated union supporting two providers:

```typescript
interface CommonSandboxConfig {
  runtime: "node22" | "typescript";
  timeout?: number;
  vcpus?: number;
}

export interface NativeSandboxConfig extends CommonSandboxConfig {
  provider: "native";
}

export interface VercelSandboxConfig extends CommonSandboxConfig {
  provider: "vercel";
  teamId: string;
  projectId: string;
  token: string;
}

export type SandboxConfig = NativeSandboxConfig | VercelSandboxConfig;
```

### 2. Vercel Sandbox Executor (`agents-run-api/src/tools/VercelSandboxExecutor.ts`)

Created a new executor that:

- Uses the `@vercel/sandbox` SDK to create isolated MicroVMs
- Writes function code and dependencies using `sandbox.writeFiles()`
- Executes commands using `sandbox.runCommand()`
- Properly handles stdout/stderr streams
- Cleans up sandboxes using `sandbox.stop()`
- Returns results in the same format as `LocalSandboxExecutor`

Key features:

- Singleton pattern for executor instances
- Support for installing npm dependencies
- TypeScript and Node.js runtime support
- Comprehensive logging and error handling
- Timeout and resource configuration

### 3. Sandbox Executor Factory (`agents-run-api/src/tools/SandboxExecutorFactory.ts`)

Created a factory class that:

- Routes execution to the appropriate sandbox provider (native or Vercel)
- Maintains separate executor instances for each provider configuration
- Provides a unified interface for function tool execution
- Handles cleanup of all executor instances

### 4. Updated Agent.ts

- Changed from directly using `LocalSandboxExecutor` to using `SandboxExecutorFactory`
- Function tools now use the factory to execute, which automatically routes to the correct provider

### 5. Updated LocalSandboxExecutor

- Added optional `name` field to `FunctionToolConfig` for consistency

### 6. Package Dependencies

Added `@vercel/sandbox@^0.0.24` to `agents-run-api/package.json`

### 7. Application-Level Configuration

Sandbox configuration is passed at application initialization time via `createExecutionApp()`:

```typescript
export function createExecutionApp(config?: {
  serverConfig?: ServerConfig;
  credentialStores?: CredentialStore[];
  sandboxConfig?: SandboxConfig;
}) {
  // ...
  return createExecutionHono(serverConfig, registry, config?.sandboxConfig);
}
```

The configuration is then:

- Stored in Hono context
- Retrieved in routes and passed to `getRegisteredAgent()`
- Forwarded to task handler config
- Used by Agent during function tool execution

## Security Considerations

- **Vercel Credentials**: Must be provided via environment variables (`VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`)
- **Credentials are never stored in the database**
- Credentials are sourced from environment at runtime
- Each sandbox is isolated in its own MicroVM
- Sandboxes are automatically terminated on timeout
- Explicit cleanup via `sandbox.stop()` after execution

## Usage Example

```typescript
import { createExecutionApp } from "@inkeep/agents-run-api";

// For native (local) execution
const app = createExecutionApp({
  sandboxConfig: {
    provider: "native",
    runtime: "node22",
    timeout: 30000,
    vcpus: 1,
  },
});

// For Vercel Sandbox execution
const app = createExecutionApp({
  sandboxConfig: {
    provider: "vercel",
    runtime: "node22",
    timeout: 30000,
    vcpus: 1,
    teamId: process.env.VERCEL_TEAM_ID!,
    projectId: process.env.VERCEL_PROJECT_ID!,
    token: process.env.VERCEL_TOKEN!,
  },
});
```

## Vercel Sandbox API Reference

Based on `@vercel/sandbox@^0.0.24`:

### Sandbox Creation

```typescript
const sandbox = await Sandbox.create({
  token: string,
  teamId: string,
  projectId: string,
  timeout: number,
  resources: { vcpus: number },
  runtime: "node22" | "python3.13",
});
```

### File Operations

```typescript
await sandbox.writeFiles([
  {
    path: "/path/to/file",
    content: Buffer.from(content, "utf-8"),
  },
]);
```

### Command Execution

```typescript
const cmd = await sandbox.runCommand({
  cmd: "node",
  args: ["script.js"],
  cwd: "/",
  env: { KEY: "value" },
});

const stdout = await cmd.stdout();
const stderr = await cmd.stderr();
const exitCode = cmd.exitCode;
```

### Cleanup

```typescript
await sandbox.stop();
```

## Testing

All existing tests pass with no modifications required. The factory pattern ensures backward compatibility with existing code using `LocalSandboxExecutor`.

## Documentation

- Referenced Vercel Sandbox documentation:
  - https://vercel.com/docs/vercel-sandbox/reference/classes/sandbox.md
  - https://vercel.com/docs/vercel-sandbox/reference/classes/command.md
  - https://vercel.com/docs/vercel-sandbox/reference/classes/commandfinished.md

## Migration Notes

- Existing code using `LocalSandboxExecutor` continues to work unchanged
- To use Vercel Sandbox, pass `sandboxConfig` with `provider: 'vercel'` to `createExecutionApp()`
- No database migrations required (sandbox config is application-level, not project-level)
- No UI changes required (sandbox config is configured in code, not via UI)

## Future Enhancements

- Support for additional runtimes (Python, etc.)
- Sandbox pooling/reuse for better performance
- Support for custom Vercel Sandbox configurations per project
- Metrics and monitoring for sandbox usage

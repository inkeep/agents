---
title: NativeSandboxExecutor Pattern Analysis
type: evidence
sources:
  - agents-api/src/domains/run/tools/NativeSandboxExecutor.ts
  - agents-api/src/domains/run/tools/SandboxExecutorFactory.ts
---

## Pattern Summary

`NativeSandboxExecutor` executes user-defined function tools in isolated child processes with:
- `spawn()` from `node:child_process` for process isolation
- `ExecutionSemaphore` for concurrency limiting (vCPU-based)
- Process pooling with dependency-based fingerprinting
- TTL (5 min) and max use count (50) for recycling
- SIGTERM → SIGKILL timeout enforcement
- 1MB output size limit

## ExecutionSemaphore (lines 70-129)

```typescript
class ExecutionSemaphore {
  private permits: number;
  private waitQueue: Array<{ resolve, reject }>;
  private maxWaitTime: number;  // default: FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS

  async acquire<T>(fn: () => Promise<T>): Promise<T>
  // Acquires permit, runs fn, releases. Queues if no permits available.
}
```

## Resource Constants (defaults.ts)

- `FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT`: 30,000ms
- `FUNCTION_TOOL_SANDBOX_POOL_TTL_MS`: 300,000ms (5 min)
- `FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT`: 50
- `FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES`: 1,048,576 (1MB)
- `FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS`: 30,000ms
- `FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS`: 60,000ms

## Key Difference for BashProcessExecutor

NativeSandboxExecutor manages untrusted user code with dependency isolation (npm install, separate node process, code injection). BashProcessExecutor runs trusted just-bash commands — no deps to install, simpler lifecycle:
- No dependency fingerprinting (all processes identical)
- No code injection (command sent via IPC)
- Same pooling, semaphore, TTL, and recycling patterns
- Same timeout enforcement (AbortSignal + SIGTERM/SIGKILL)

## Deployment Compatibility

NativeSandboxExecutor works on Docker, Kubernetes, Vercel, Lambda. Uses `/tmp` for temp files. BashProcessExecutor uses the same `spawn()` mechanism — should work in all the same environments. IPC via `process.send()`/`process.on('message')` is standard Node.js and works everywhere.

## No Worker Threads in Codebase

Zero existing usage of `worker_threads`. Only Web Workers for Monaco editor in the browser. Child processes are the established pattern for CPU isolation.

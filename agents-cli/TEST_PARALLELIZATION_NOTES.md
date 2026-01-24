# CLI Test Parallelization Analysis

This document analyzes the test suite in `agents-cli` to understand why tests run sequentially and which tests could potentially be parallelized.

## Current Configuration

The vitest configs enforce sequential execution through multiple settings:

### `vitest.config.ts` (local development)
```typescript
pool: 'threads',
poolOptions: {
  threads: {
    singleThread: true,  // Forces sequential execution
    isolate: true,
  },
},
maxConcurrency: 1,
fileParallelism: false,  // Disables parallel file execution
```

### `vitest.config.ci.ts` (CI environment)
```typescript
pool: 'forks',
poolOptions: {
  forks: {
    singleFork: true,  // Forces sequential execution
    isolate: true,
    vmThreads: false,
  },
},
maxConcurrency: 1,
fileParallelism: false,
```

## Analysis of Test Files

### Tests That NEED Sequential Execution (High Risk for Parallelization)

These tests have characteristics that make parallel execution risky:

| File | Reason |
|------|--------|
| `src/__tests__/cli.test.ts` | Spawns child processes (`execSync`) that could conflict with parallel test processes. Tests CLI binary execution which may have shared state. |
| `src/__tests__/commands/push.test.ts` | Mocks `process.exit`, `console.log/error`, and many modules. Heavy mocking could interfere with parallel tests. |
| `src/__tests__/commands/init.test.ts` | Mocks file system (`node:fs`), `process.exit`, and console methods. Uses `vi.clearAllMocks()` which could affect other tests. |
| `src/__tests__/commands/config.test.ts` | Mocks file system for config file operations. Tests that create/read config files could conflict. |
| `src/__tests__/commands/auth.test.ts` | Creates temporary directories with `mkdirSync`, writes files. File system operations could conflict if parallel tests use similar paths. |
| `src/__tests__/utils/profile-config.test.ts` | Creates/deletes temporary directories, writes YAML files. Path collisions possible in parallel. |
| `src/__tests__/api.test.ts` | Mocks `global.fetch` - this global mock would definitely interfere with parallel tests. |

### Tests That COULD Run in Parallel (Low Risk)

These tests are more isolated and could potentially run in parallel:

| File | Reason Safe |
|------|-------------|
| `src/utils/__tests__/package-manager.test.ts` | Pure function tests (`getUpdateCommand`), no file system or global mocks. |
| `src/utils/__tests__/url.test.ts` | Likely pure utility functions for URL manipulation. |
| `src/commands/pull-v3/components/__tests__/*.test.ts` (13 files) | Code generators that transform data to strings. Likely pure functions with no side effects. Examples: `agent-generator.test.ts`, `trigger-generator.test.ts`, `mcp-tool-generator.test.ts`, etc. |
| `src/__tests__/utils/json-comparator.test.ts` | Likely pure comparison functions. |
| `src/__tests__/utils/templates.test.ts` | Likely template string generation. |

## Key Parallelization Blockers Identified

### 1. Global Mock Pollution
Many tests mock global objects:
- `global.fetch` in `api.test.ts`
- `console.log/error` in multiple command tests
- `process.exit` in command tests

When running in parallel, these global mocks can "leak" between test files.

### 2. File System Race Conditions
Tests that create/modify files or directories:
- `auth.test.ts` - temp directory creation/deletion
- `profile-config.test.ts` - YAML file writing
- `init.test.ts` - config file creation
- `config.test.ts` - config file read/write

If two tests try to create files with similar names or in the same directory, they can conflict.

### 3. Process State Modifications
- `process.exit` mocking
- `process.env` modifications
- Working directory changes

### 4. Child Process Execution
- `cli.test.ts` spawns actual CLI processes
- These processes could compete for resources or have timing issues

## Recommendations

### Option A: Split into Two Configs (Recommended)
Create `vitest.parallel.config.ts` for safe tests:
- Include only the `pull-v3/components/__tests__/` generator tests
- Include pure utility tests (`package-manager.test.ts`, `url.test.ts`, `json-comparator.test.ts`)

Keep existing config for risky tests:
- Command tests that mock globals
- Tests with file system operations
- CLI integration tests

### Option B: Improve Test Isolation
Refactor tests to be more isolated:
1. Use unique temp directories per test (with random suffixes)
2. Scope mocks to individual tests instead of files
3. Use `vi.doMock()` for per-test mocking
4. Avoid global.fetch mocking, use dependency injection instead

### Option C: Accept Sequential Execution
The current approach (sequential execution) is the safest but slowest. Given:
- CLI tests have 120-180 second timeouts
- Many tests do complex mocking
- The total test count (38 files) isn't extreme

Sequential execution may be acceptable trade-off for reliability.

## Test File Summary

| Category | Count | Parallelization Risk |
|----------|-------|---------------------|
| Command tests | 7 | HIGH - heavy mocking |
| Utility tests | 10 | MIXED - some safe, some risky |
| Generator tests | 13 | LOW - pure functions |
| Integration tests | 5 | HIGH - process/file operations |
| Other | 3 | MEDIUM |
| **Total** | **38** | |

## Estimated Impact

If generator tests (13 files) could run in parallel:
- Current sequential time: ~13 * avg_time
- Parallel time: ~2 * avg_time (with 6-8 workers)
- Potential speedup: ~6x for generator tests only

Overall test suite impact would be limited since command/integration tests would still run sequentially.

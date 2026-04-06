---
title: just-bash Library Assessment
type: evidence
sources:
  - https://github.com/vercel-labs/just-bash
  - https://www.npmjs.com/package/just-bash
---

## Overview

`vercel-labs/just-bash` v2.14.0 — TypeScript virtual bash environment with in-memory filesystem. Sandboxed, no host access by default. Apache-2.0 license.

## API Surface (what we use)

```typescript
import { Bash } from 'just-bash';

const bash = new Bash({
  executionLimits: { maxCallDepth: 50 },
  // defaults: InMemoryFs, no network, no python, no javascript
});

const result = await bash.exec("jq '.items[]'", {
  stdin: '{"items": [1, 2, 3]}',
  signal: AbortSignal.timeout(30_000),
});

// result.stdout: "1\n2\n3\n"
// result.stderr: ""
// result.exitCode: 0
```

## Key Commands (data processing relevant)

- **jq**: Full jq implementation — filters, selects, transforms, CSV/TSV output
- **grep/egrep/fgrep/rg**: Text search with regex
- **awk/sed**: Text transformation
- **sort/uniq/head/tail/cut/wc**: Data manipulation
- **yq**: YAML/XML/TOML processing
- **xan**: CSV processing
- **sqlite3**: SQL queries on structured data
- **diff**: Compare data sets

## Dependencies

19 direct deps. Heavy ones:
- `sql.js` — WASM SQLite (~2MB)
- `quickjs-emscripten` — WASM JavaScript runtime (~3MB)
- `compressjs`, `modern-tar` — compression support

We don't use python/JS/sqlite features but they're bundled. Server-side only, so bundle size accepted.

## Security Model

- InMemoryFs by default — no disk access
- No network by default — must explicitly enable
- No real OS processes — jq/grep are JS implementations
- AbortSignal for cooperative cancellation
- `executionLimits.maxCallDepth` for recursion protection

## Risk Assessment

- **Beta label**: API is stable (v2.x, clean interfaces), but "beta" means no SLA
- **Maintenance**: Vercel Labs, active commits, but unclear long-term commitment
- **Mitigation**: Our API surface is narrow (constructor + exec). Wrapper is thin enough to swap implementations if needed. jq-wasm + regex would cover core use cases.

## stdin Support

`exec()` accepts `stdin: string` option. Commands that read from stdin (jq, grep, cat, etc.) receive this data. This is the integration mechanism — no filesystem writes needed.

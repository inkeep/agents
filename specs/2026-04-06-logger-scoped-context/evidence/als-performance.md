---
title: AsyncLocalStorage and pino child logger performance benchmarks
sources:
  - Node.js v22.18.0 benchmarks (darwin arm64)
  - Pino official benchmarks (child-loggers.md)
  - Node.js core team documentation
---

## AsyncLocalStorage costs (Node.js v22+)

| Operation | Cost | When |
|---|---|---|
| getStore() with 1 ALS | ~5 ns | Per log call (if reading from ALS) |
| getStore() with 11 ALS | ~12 ns | Per log call |
| run() new scope (new object) | ~41 ns | Once per request/scope |
| run() new scope (pre-allocated) | ~26 ns | Once per request/scope |
| Async propagation overhead | ~78 ns | Per await boundary |

## Pino child logger costs

| Operation | Cost | When |
|---|---|---|
| child() creation | ~26 us | Once per scope |
| Child log call overhead | ~0 | Bindings pre-serialized as string fragment |
| Parent log call | ~11.5 us | Baseline |
| Child log call | ~23.2 us | Includes string concat of chindings |
| Child-of-child log call | ~22.9 us | Same as child |

Key insight: pino.child() pre-serializes bindings to a JSON string fragment at creation time.
Per-log-call cost is just string concatenation — no JSON.stringify, no object iteration.

## Design choice: child logger in ALS vs mixin

Option A (mixin + ALS): getStore() + object merge on EVERY log call → ~5ns + merge overhead per call
Option B (child in ALS): child() creation once (~26us), then zero per-call overhead → chosen

## Node.js version trajectory

- v14-v16: async_hooks based, ~8% real-world overhead
- v18-v20: Optimized promise hook fast-path
- v22: AsyncContextFrame available (opt-in via V8 API)
- v23-v24+: AsyncContextFrame is default, pointer-based getStore()

## Pitfalls

- Memory: don't store large objects in ALS store (our store is a pino logger instance — lightweight)
- Scaling: cost linear with number of active ALS instances (keep to 1-3)
- enterWith(): avoid, use run() for proper isolation

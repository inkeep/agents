# Spec Changelog

## 2026-04-02 — Session 1

- **Intake completed**: Multi-user webhook triggers following the same data model as scheduled triggers.
- **Key decisions locked**: Join table in manage DB (no user FK, app-driven cleanup), fan-out on webhook invocation, dispatchDelayMs, response shape change, same auth rules as scheduled triggers.
- **Evidence gathered**: Full mapping of webhook trigger system — schema, execution flow, UI, cleanup patterns. Persisted to evidence/current-system.md.
- **Spec drafted**: SPEC.md with 9 decisions, migration strategy, agent constraints.
- **Consistency fix**: Clarified that fan-out calls `dispatchExecution()` once per user, with each successful call creating its own invocation before background execution. Removed the conflicting batch-create language and updated partial-failure semantics accordingly.
- **Runtime clarification**: Documented `dispatchDelayMs` as acceptable for v1, with best-effort behavior in unsupported serverless runtimes and stronger guarantees deferred to future queue/workflow work if needed.

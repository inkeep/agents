---
"@inkeep/agents-api": patch
---

Harden the SigNoz query proxy to recover when SigNoz rejects unknown attribute keys with HTTP 500 (v0.96.x returns 500, not 400, for unrecognized select fields). The proxy now reprobes with untyped selects to surface the offending fields, strips them, and retries — so trace queries that reference newly added span attributes degrade gracefully instead of failing the whole request. The strip-and-retry loop is also bounded by an overall wall-clock deadline and a retry cap that scales with the query's select-field count, so a partially-degraded SigNoz cannot hold a request open indefinitely (notably on self-hosted deployments without an implicit function timeout). Non-JSON error responses (HTML error pages, empty gateway timeouts) now surface an error carrying the upstream status instead of an opaque JSON parse failure.

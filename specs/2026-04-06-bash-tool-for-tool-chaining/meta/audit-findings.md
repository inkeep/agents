# Audit Findings

## HIGH Severity

### H1. Vercel Serverless Incompatible with Child Process Pools — ACCEPTED, DESIGN CHANGED
Child process pools (warm processes, 5-min TTL) incompatible with Vercel serverless freeze/thaw. Moved bash tool to Phase 2 with Vercel compat as prerequisite.

### H2. Tool Result Caching Not Auto-handled by wrapToolWithStreaming — ACCEPTED, SPEC CORRECTED
`wrapToolWithStreaming` does NOT call `recordToolResult()`. Each tool type caches explicitly. Phase 2 bash tool must do the same. Spec updated.

### H3. just-bash Unverified — ACCEPTED, SPIKE REQUIRED
Package exists (verified via GitHub/npm) but not installed in codebase. Phase 2 requires dependency spike.

## MEDIUM Severity

### M1. Non-JSON Source Data — ACCEPTED, ADDRESSED IN PHASE 1
Added serialization table in spec: strings pass as-is (not re-quoted), MCP content unwrapped, buffers rejected.

### M4. No Observability — ACCEPTED, ADDED TO PHASE 2 OQs
OpenTelemetry spans required for bash tool calls.

### M5. D4 Contradicts Resource Limits — RESOLVED
Removed conflicting statements. Phase 1 ($jq) has no output cap. Phase 2 limits TBD.

### M6. Conversation History Storage — NOTED
Phase 2 should consider marking intermediate bash calls to avoid storage bloat.

## LOW Severity

L1-L6: Noted. Minor corrections applied or deferred to Phase 2.

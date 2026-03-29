# Replay Protection Strategy — Evidence Summary

**Captured:** 2026-03-06
**Source:** Research report at `reports/altcha-replay-protection/REPORT.md`

## Recommendation

UNLOGGED PostgreSQL table with `INSERT ... ON CONFLICT DO NOTHING` for atomic exactly-once challenge acceptance. Simple periodic DELETE for cleanup.

## Key Facts

- **INSERT ON CONFLICT DO NOTHING** is the optimal pattern: atomic, no dead tuples on conflict, single round-trip, correct under concurrency without advisory locks
- **UNLOGGED table** gives 2-3x write throughput, near-zero WAL impact. Crash truncates table to empty, but 5-min challenge TTL provides defense-in-depth
- **Hybrid approaches (bloom filters, in-memory) not justified** — DB INSERT is already sub-ms on a small cached table
- **Capacity:** PostgreSQL handles this up to ~10K-30K req/sec with UNLOGGED. At 1K req/sec, needs only ~2 concurrent connections

## Schema

```sql
CREATE UNLOGGED TABLE used_challenges (
  signature TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT used_challenges_pkey PRIMARY KEY (signature)
);
```

## Verification Flow

```
1. verifySolution(payload, hmacKey) → cryptographic check
2. INSERT INTO used_challenges (signature, expires_at) VALUES ($1, $2) ON CONFLICT (signature) DO NOTHING
3. rowCount = 1 → accept (first use)
4. rowCount = 0 → reject (replay)
```

## Cleanup

Simple periodic DELETE every 1-5 minutes:
```sql
DELETE FROM used_challenges WHERE expires_at < NOW();
```

Graduate to partitioned tables with partition dropping only at >1K req/sec sustained.

## Race Condition Handling

Two instances + same challenge: PostgreSQL unique index lock guarantees exactly one INSERT succeeds (rowCount=1), the other gets rowCount=0. No deadlock risk for single-row operations. READ COMMITTED sufficient.

## Storage

~100 bytes/row. At 1K req/sec with 5-min TTL: ~50 MB (table + index). Negligible.

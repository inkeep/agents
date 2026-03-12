# ALTCHA Library Capabilities — Evidence Summary

**Captured:** 2026-03-06
**Source:** Research report at `reports/altcha-proof-of-work-integration/REPORT.md`

## Key Facts

- **Package:** `altcha-lib` v1.4.1, MIT, zero runtime dependencies, dual ESM/CJS
- **CRITICAL:** Must use v1.4.1+ due to CVE-2025-68113 (challenge splicing, CVSS 6.5)
- **Bun compatible:** Officially supported, uses Web Crypto API (globally available in Bun 1+)

## Server API (2 functions needed)

```typescript
import { createChallenge, verifySolution } from 'altcha-lib';

// Generate challenge
const challenge = await createChallenge({
  hmacKey: string,        // REQUIRED — server secret
  algorithm?: Algorithm,  // default: 'SHA-256'
  maxnumber?: number,     // difficulty ceiling (default: 1,000,000)
  expires?: Date,         // challenge expiry
  params?: Record<string, string>,  // metadata embedded in salt
});
// Returns: { algorithm, challenge, maxnumber, salt, signature }

// Verify solution
const ok = await verifySolution(payload: string | Payload, hmacKey: string, checkExpires?: boolean);
// Returns: boolean
```

## Replay Protection

**NOT built in.** Library is stateless. Must implement:
- Store used challenge signatures (Set, Redis, or DB)
- Check-before-accept: reject if signature already seen
- TTL-based cleanup after challenge expiry

## Difficulty Benchmarks (maxnumber)

| maxnumber | Desktop | Budget Mobile |
|-----------|---------|---------------|
| 10,000 | <0.1s | ~0.25s |
| 50,000 | ~0.15s | ~1.2s |
| 100,000 | ~0.33s | ~2.5s |
| 500,000 | ~1.5s | ~12s |

## Client Options

1. **`altcha` widget** — 17KB Web Component, drop-in UI with Web Worker solving
2. **`altcha-lib` headless** — `solveChallenge()` for programmatic use, supports AbortController

---
"@inkeep/agents-api": minor
---

Add ALTCHA Sentinel as the primary widget bot-protection path; preserve the legacy local-PoW endpoint as a Sentinel-backed compatibility shim.

**New endpoints (Sentinel, primary path):**
- `GET /run/auth/sentinel/challenge` — Sentinel challenge proxy (returns HIS config when scoring is enabled)
- `POST /run/auth/sentinel/challenge` — HIS interaction data submission
- `POST /run/auth/sentinel/verify` — Sentinel verification proxy

**Legacy endpoint (preserved for old widgets):** `GET /run/auth/pow/challenge` now proxies a Sentinel PoW v1 Security Group instead of using a self-hosted HMAC key. Existing widget builds keep working without code changes; verification at `/anonymous-session` discriminates v1 (classic ALTCHA solution) and v2 (Sentinel HIS payload) envelopes by shape.

**New env vars:**
- v2 (Sentinel HIS): `INKEEP_SENTINEL_API_KEY_ID`, `INKEEP_SENTINEL_API_KEY_SECRET`, `INKEEP_SENTINEL_BASE_URL` — all three required together, or all unset to disable.
- v1 (legacy PoW compat): `INKEEP_SENTINEL_V1_API_KEY_ID`, `INKEEP_SENTINEL_V1_API_KEY_SECRET` — both required together; reuses `INKEEP_SENTINEL_BASE_URL`.

Enabling v1 alongside v2 is a migration-only posture: clients choose the verification path by envelope shape, and v1 has no replay protection and no HIS scoring. Disable `INKEEP_SENTINEL_V1_*` once legacy widget traffic drops to ~0.

**Fail-open posture:** Sentinel verification distinguishes upstream errors (network failure, non-JSON response) from explicit verification rejections. Upstream errors fail open so a Sentinel outage doesn't block legitimate users; explicit rejections fail closed with 403.

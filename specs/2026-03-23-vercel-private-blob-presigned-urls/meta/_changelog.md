# Changelog

## 2026-03-23 — Session 1: Initial investigation

- Fetched and analyzed Vercel Private Blob Storage docs
- Investigated @vercel/blob SDK API surface — confirmed NO presigned URL support
- Reviewed GitHub issues #544, #594, #816 — all resolved by Private Storage launch, not presigned URLs
- Explored current codebase: multi-backend blob storage, manage proxy, blob URI resolution
- Discovered existing spec `2026-03-19-run-media-signed-proxy` with HMAC-signed URL design
- Created evidence files: vercel-blob-capabilities.md, current-implementation.md
- Drafted initial SPEC.md with problem statement and world model

## 2026-03-23 — Session 1 (cont): Cost comparison and S3 recommendation

- Built detailed cost comparison: S3 presigned ~$0.09/GB vs Vercel Blob proxy ~$0.21-0.32/GB (2.3-3.5x cheaper)
- Implementation comparison: S3 presigned ~50 lines vs Vercel proxy ~200+ lines
- Strong recommendation to adopt S3 presigned URLs
- Created evidence/cost-comparison.md

## 2026-03-23 — Session 1 (cont): Security investigation — same-domain risks

- Investigated cookie leakage and XSS risks of same-domain media serving
- Confirmed: Better Auth cookies use `cookieDomain` shared across subdomains — subdomain isolation insufficient
- Confirmed: uploaded SVG/HTML files served from API origin can make authenticated API calls using session cookies
- Key finding: S3 presigned URLs automatically provide domain isolation (`*.s3.amazonaws.com`) — no cookie leakage, XSS sandboxed
- Created evidence/same-domain-security-risks.md
- Updated SPEC.md: added security analysis to all architecture options, updated decision log (D2-D5), updated assumptions (A3-A4)
- Security concern is an additional strong argument for S3 over any same-domain proxy pattern

## 2026-03-24 — Session 2: Decisions resolved + implementation design

- **Resolved all 3 blocking P0 questions:**
  - Q1 → Option C (S3 presigned URLs) — decided
  - Q2 → S3 provider is fully implemented in codebase, Vercel Blob not configured in prod — S3 is the path forward
  - Q3 → This spec supersedes `2026-03-19-run-media-signed-proxy` (HMAC proxy no longer needed)
- **Added implementation design (§5):**
  - `BlobStorageProvider.getPresignedUrl()` — optional method, S3 implements via `@aws-sdk/s3-request-presigner`
  - `resolveMessageBlobUris()` becomes async — tries presigned URL first, falls back to manage proxy
  - 2 call sites to update (both already async route handlers — just add `await`)
  - Manage proxy kept for backward compat (Vercel Blob / local fallback)
- **Added decisions D6-D10**, requirements R1-R7, files-to-change matrix

## 2026-03-27 — Session 3: Simplified local dev story

- Removed all local S3 mock infrastructure (MinIO deprecated, LocalStack archived, S3Mock unnecessary)
- **New approach:** Local dev uses existing local filesystem + manage media proxy (no change from today). Presigned URLs are a production-only optimization that activates when `BLOB_STORAGE_S3_BUCKET` is configured.
- Removed R5 (local dev presigned URLs), §5.5 S3Mock section, docker-compose/env changes from files-to-change
- Updated D8, D9, D10 to reflect simplified local dev story
- **8 files to change** (down from 10) — no Docker or env config changes needed

## 2026-03-27 — Session 3 (cont): Finalized spec

- Renumbered sections (was 1,2,3,8,9,4,5,10,11,12 → now sequential 1-10)
- Renamed title to "S3 Presigned URLs for Private Media Delivery"
- Marked Option C as ✅ SELECTED in architecture options
- Switched from Option C to **Option D (Hybrid)** — better framing for what the implementation already does: S3 presigned when configured, manage proxy fallback otherwise
- Status: Draft → **Final**
- Zero blocking open questions remain

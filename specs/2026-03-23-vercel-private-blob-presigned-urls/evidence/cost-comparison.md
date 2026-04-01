# Cost Comparison: Vercel Blob Private vs S3 Presigned URLs vs GCS Signed URLs

**Date:** 2026-03-23
**Sources:** Vercel pricing docs, AWS S3 pricing, GCS pricing

## Storage Costs (per GB/month)

| Provider | Cost | Notes |
|----------|------|-------|
| Vercel Blob | $0.023 | Same as S3 Standard |
| AWS S3 Standard | $0.023 | First 50 TB |
| GCS Standard | $0.020 | Single region |

Storage costs are effectively identical.

## Data Transfer Per GB Served (the key differentiator)

### Vercel Private Blob (proxy pattern — only option)

Every request must go through a serverless function (double-hop):

| Cost Component | Per GB | Notes |
|----------------|--------|-------|
| Blob Data Transfer (function → blob store) | $0.05 | On CDN cache miss |
| Fast Origin Transfer (function → blob store) | ~$0.06 | On CDN cache miss |
| Fast Data Transfer (function → browser) | ~$0.15 | Always (FDT ≈ 3x BDT per Vercel) |
| Fast Origin Transfer (function → browser) | ~$0.06 | Always |
| **Subtotal data transfer** | **~$0.32/GB** | Worst case (cache miss) |
| Function compute | Variable | CPU time + memory per invocation |
| Edge Request | $2/million | Per request |

With CDN cache hit on the internal leg, reduces to ~$0.21/GB + function costs.

### AWS S3 Presigned URL (direct client-to-S3 — zero proxy)

| Cost Component | Per GB | Notes |
|----------------|--------|-------|
| S3 Data Transfer Out | $0.09 | After first 100 GB/month free |
| GET Request | $0.0004/1K | Negligible |
| **Total** | **~$0.09/GB** | No function invocation needed |

### GCS Signed URL (direct client-to-GCS — zero proxy)

| Cost Component | Per GB | Notes |
|----------------|--------|-------|
| GCS Network Egress | $0.08-0.12 | Varies by destination |
| Class A Operations | $0.05/10K | Negligible |
| **Total** | **~$0.08-0.12/GB** | No function invocation needed |

## Cost Ratio Summary

| Scenario | Transfer Cost/GB | Function Cost | Total Relative Cost |
|----------|-----------------|---------------|-------------------|
| Vercel Private Blob (proxy) | ~$0.21-0.32 | Yes | **3.5x baseline** |
| S3 Presigned URL (direct) | ~$0.09 | None | **1x (baseline)** |
| GCS Signed URL (direct) | ~$0.08-0.12 | None | **~1x** |

**S3 presigned URLs are 2.3x-3.5x cheaper per GB served than Vercel Private Blob proxy delivery**, AND they eliminate function invocation costs entirely.

## Implementation Cost Comparison

### S3 Presigned URLs — Add to existing S3 provider

```
Effort: ~50 lines of code, 1-2 hours
Dependencies: + @aws-sdk/s3-request-presigner (already peer of @aws-sdk/client-s3)
New routes needed: None — client fetches directly from S3
New infrastructure: None — uses existing S3 bucket
```

Changes:
1. Add `getPresignedUrl(key, expiresIn)` method to S3BlobStorageProvider
2. Add `getPresignedUrl` to BlobStorageProvider interface (optional method)
3. Update `resolveMessageBlobUris()` to use presigned URL when S3 backend is active
4. Tests

### Vercel Private Blob Proxy (existing spec approach)

```
Effort: ~200+ lines of code, 1-2 days
Dependencies: None new (uses node:crypto)
New routes needed: Yes — /run/v1/media/:mediaKey
New infrastructure: None, but consumes function budget
```

Changes:
1. Create media-url-signing.ts (signMediaUrl, verifyMediaSignature)
2. Create media route handler with path validation
3. Register route in run domain
4. Update resolveMessageBlobUris()
5. Tests for signing, verification, proxy handler, blob URI resolution

### Dedicated Vercel Project (Option B from spec)

```
Effort: ~300+ lines + ops setup, 2-3 days
Dependencies: New Vercel project
New routes needed: Yes (in new project)
New infrastructure: New Vercel project, shared secrets, separate deployment
```

## Scaling Scenarios (Napkin Math)

### Scenario: 100K images/month, avg 500KB each = 50 GB transfer

| Approach | Monthly Transfer Cost | Function Cost | Total |
|----------|----------------------|---------------|-------|
| Vercel Blob proxy | ~$10.50-16.00 | ~$1-3 | **~$12-19** |
| S3 presigned | ~$4.50 | $0 | **~$4.50** |

### Scenario: 1M images/month, avg 500KB each = 500 GB transfer

| Approach | Monthly Transfer Cost | Function Cost | Total |
|----------|----------------------|---------------|-------|
| Vercel Blob proxy | ~$105-160 | ~$10-30 | **~$115-190** |
| S3 presigned | ~$36 | $0 | **~$36** |

At scale, the difference is 3-5x.

## Qualitative Comparison

| Factor | Vercel Blob | S3/GCS |
|--------|-------------|--------|
| Native presigned URLs | No | Yes |
| Proxy required | Yes (always) | No |
| Function invocations | Every read | None for reads |
| CDN integration | Vercel CDN (built-in) | CloudFront/CDN optional |
| Operational complexity | Low (Vercel-managed) | Moderate (IAM, bucket policies) |
| Vendor lock-in | Vercel-only | AWS/GCP (portable) |
| Max file size | 5TB (512MB for cached) | 5TB (5GB for presigned PUT) |
| Rate limits | 120/s simple ops (Pro) | 5,500 GET/s per prefix |
| Multi-region | Vercel handles | Requires S3 replication |

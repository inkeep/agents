Use when: Capturing evidence (Step 3) or validating citations (Step 5); ensuring claims are substantiated
Priority: P1
Impact: Without this, evidence citations will be inconsistent and claims may lack proper substantiation

---

# Evidence Citation Formats

Standardized formats for substantiating claims in research reports. Use these consistently to make reports verifiable and reproducible.

---

## Citation Hierarchy

Use the strongest available evidence type:

| Strength | Source Type | When to Use |
|----------|-------------|-------------|
| 1 (Strongest) | Source code with line numbers | Implementation claims |
| 2 | Configuration files | Setup/deployment claims |
| 3 | Official documentation | Capability claims |
| 4 | API responses/schemas | Interface claims |
| 5 | GitHub issues/PRs | Roadmap/known issues |
| 6 | Blog posts/articles | Context/history |
| 7 (Weakest) | Inference | When no direct evidence exists |

---

## Code Evidence Formats

### Basic Code Citation

```markdown
**Source:** `packages/auth/session.ts` (lines 45-67)

```typescript
export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}
```
```

### Code with Inline Explanation

```markdown
**Source:** `packages/auth/session.ts` (lines 45-67)

```typescript
export interface Session {
  id: string;           // Primary key
  userId: string;       // Foreign key to User
  expiresAt: Date;      // TTL enforcement
  tenantId?: string;    // Multi-tenancy support (optional)
}
```
```

### Code with Context Paragraph

```markdown
Session management uses JWT tokens with configurable expiry.

**Source:** `packages/auth/session.ts` (lines 45-67)

```typescript
const token = jwt.sign(payload, secret, {
  expiresIn: config.sessionTTL || '7d'
});
```

This means sessions default to 7-day expiry unless `SESSION_TTL` is configured.
```

### Multiple File Evidence

```markdown
**Evidence from multiple sources:**

1. Schema definition - `packages/db/schema.ts` (line 23)
2. Migration - `packages/db/migrations/001_create_sessions.sql`
3. Service implementation - `packages/auth/session.service.ts` (lines 45-120)
```

---

## Configuration Evidence Formats

### Environment Variable

```markdown
**Configuration:** Environment variable

```bash
SESSION_TTL=86400  # Seconds (default: 604800 = 7 days)
```
```

### Config File

```markdown
**Source:** `config/default.yaml`

```yaml
auth:
  session:
    ttl: 604800      # 7 days in seconds
    secure: true     # HTTPS-only cookies
    sameSite: strict # CSRF protection
```
```

### Docker/Compose

```markdown
**Source:** `docker-compose.yml`

```yaml
services:
  app:
    environment:
      - DATABASE_URL=postgres://...
      - REDIS_URL=redis://...
```
```

---

## Documentation Evidence Formats

### Official Docs Quote

```markdown
From the [official documentation](https://docs.example.com/auth):

> "Sessions are stored server-side with a default TTL of 7 days.
> Configure `SESSION_TTL` environment variable to customize."
```

### API Reference

```markdown
**From API Reference:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

**Response:**
```json
{
  "token": "eyJhbG...",
  "expiresAt": "2024-01-15T00:00:00Z"
}
```
```

### README/Inline Docs

```markdown
**Source:** `packages/auth/README.md`

> ## Configuration
>
> | Variable | Default | Description |
> |----------|---------|-------------|
> | `SESSION_TTL` | `604800` | Session lifetime in seconds |
```

---

## Confidence Level Formats

### CONFIRMED (Direct Evidence)

```markdown
**CONFIRMED:** Sessions use JWT tokens with HS256 signing.

**Evidence:** `packages/auth/jwt.ts` (line 12)
```typescript
const algorithm = 'HS256';
```
```

### INFERRED (Logical Deduction)

```markdown
**INFERRED:** The system requires Redis for session storage in distributed mode.

**Basis:**
- Session service imports `ioredis` (`session.service.ts:3`)
- No fallback to in-memory storage observed
- Deployment docs require Redis URL

**Confidence:** High - multiple corroborating evidence points.
```

### UNCERTAIN (Incomplete Evidence)

```markdown
**UNCERTAIN:** WebSocket support may be available for real-time updates.

**Partial evidence:**
- Socket.io is listed in `package.json` dependencies
- No usage found in codebase
- No documentation mentions real-time features

**Status:** Likely planned but not implemented.
```

### NOT FOUND (Confirmed Absence)

```markdown
**NOT FOUND:** No SAML/SSO support in the OSS version.

**Search performed:**
- Keywords: `saml`, `sso`, `identity-provider`, `idp`
- Directories: `packages/auth/`, `packages/enterprise/`
- Result: Zero matches

**Implication:** SSO would require custom implementation or third-party service.
```

---

## External Source Formats

### GitHub Issue/PR

```markdown
**Source:** [GitHub Issue #1234](https://github.com/org/repo/issues/1234)

> "We're planning to add SAML support in Q2 2024"
> — @maintainer, 2024-01-15

**Note:** This is a roadmap item, not a current feature.
```

### Blog Post

```markdown
**Source:** [Company Blog - "Announcing v2.0"](https://blog.example.com/v2-announcement) (2024-01-10)

Key changes mentioned:
- New authentication system
- Breaking change: Session format changed
```

### External Article

```markdown
**Source:** [InfoQ - "How X Handles Y"](https://www.infoq.com/articles/x-handles-y/) (2023-12-01)

Relevant insight:
> "The architecture uses event sourcing for audit trails..."

**Caveat:** External article, may not reflect current implementation.
```

---

## Comparative Evidence Formats

### Feature Comparison

```markdown
| Feature | System A | System B | Evidence |
|---------|----------|----------|----------|
| JWT Auth | ✅ | ✅ | A: `auth.ts:12`, B: `jwt.service.ts:8` |
| SAML | ❌ | ✅ | B: `saml/` directory exists |
| MFA | ✅ | ❌ | A: `mfa.ts`, B: Not found |
```

### Version Comparison

```markdown
| Capability | v1.x | v2.x | Migration Note |
|------------|------|------|----------------|
| Session storage | In-memory | Redis | Breaking: Requires Redis |
| Auth tokens | Opaque | JWT | Breaking: Token format changed |
```

---

## Negative Evidence Formats

### Search Documentation

```markdown
**Search for:** Multi-tenancy support

**Searched:**
- Keywords: `tenant`, `organization`, `workspace`, `team`
- Files: `packages/*/src/**/*.ts`
- Documentation: `docs/`, `README.md`

**Result:** No multi-tenancy primitives found.

**Conclusion:** System is single-tenant by design. Multi-tenancy requires multi-deploy pattern.
```

### Absence with Implication

```markdown
**Missing:** Rate limiting

**Evidence of absence:**
- No rate limiter middleware in `packages/api/middleware/`
- No Redis/memory rate limit patterns
- No configuration options for rate limits
- Not mentioned in security documentation

**Implication:** Applications must implement rate limiting at infrastructure layer (nginx, API gateway) or add custom middleware.
```

---

## Version/Date Context Formats

### Repository Version

```markdown
**Analysis Context:**
- Repository: `github.com/org/repo`
- Branch: `main`
- Commit: `abc1234` (2024-01-15)
- Version: `v2.1.0`
```

### Time-Bounded Statement

```markdown
**As of January 2024**, the system does not support WebSocket connections.

**Note:** This may change. Check [releases](https://github.com/org/repo/releases) for updates.
```

### Pre-Release Warning

```markdown
**Version analyzed:** `v3.0.0-beta.2`

**Warning:** This is pre-release software. APIs and features may change before GA.
```

---

## Composite Evidence Block

For complex claims requiring multiple evidence types:

```markdown
### Claim: System uses AES-256-GCM for credential encryption

**Primary Evidence (Code):**

**Source:** `packages/crypto/encryption.ts` (lines 23-45)

```typescript
import { createCipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export function encrypt(plaintext: string, key: Buffer): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  // ...
}
```

**Supporting Evidence (Configuration):**

**Source:** `config/security.yaml`

```yaml
encryption:
  algorithm: aes-256-gcm
  keyLength: 256
```

**Corroborating Evidence (Documentation):**

From [Security Docs](https://docs.example.com/security):

> "All credentials are encrypted at rest using AES-256-GCM with random IVs."

**Confidence:** CONFIRMED - Multiple consistent sources.
```

---

## Inline Report Citations (Named References)

Evidence files use full citation formats (code paths, URLs, snippets, confidence labels). REPORT.md uses a lighter **named-reference** style so readers can assess source credibility at a glance.

**Format:** `[Proper Noun](URL)` — link text is just the source's proper noun. Nothing else in the link text — sample sizes, caveats, and context go in surrounding prose.

**Examples:**

```markdown
Reply rates have declined 40-60% since 2019 ([Smartlead](url) 5.1%, [Instantly](url) 3.43%, [Belkins](url) 5.8%).
```

```markdown
Connection notes lower acceptance by 2-12pp ([Belkins](url) 20M+; three smaller studies show mixed results).
```

```markdown
Image personalization lifts reply rates 3x ([Lemlist](url) — vendor-conducted; product incentive bias).
```

**What goes in the link text vs surrounding prose:**

| In the link text | In surrounding prose |
|---|---|
| Proper noun only: `[Gong]`, `[Belkins]`, `[Backlinko]` | Sample size: "20M+", "12M", "500+" |
| | Population qualifier: "PR/journalist outreach, not B2B sales" |
| | Methodology caveat: "vendor-conducted", "practitioner-reported" |
| | Product bias: "sells image personalization features" |

**When NOT to use named refs:**
- Claims drawing on 3+ sources — that's synthesis. Omit inline refs entirely; the `**Evidence:**` link carries attribution. Don't list sources just because they exist.
- Analytical conclusions that are the report's own synthesis across dimensions
- If adding a citation would change how you'd naturally write the sentence, don't add it

Named refs should feel invisible — a reader barely notices them. If the report starts reading like a Wikipedia article with bracketed links every other phrase, there are too many.

**Named refs are REPORT.md only.** Evidence files continue to use full citation formats (file paths, line numbers, URL + access date, snippets). The named ref in REPORT.md should point to the external source URL directly, or to the evidence file when no stable URL exists.

---

## Quick Reference

### Minimum Citation Requirements

| Claim Type | Minimum Evidence |
|------------|------------------|
| "X uses Y" | Code snippet + file path |
| "X supports Y" | Code or documentation |
| "X does not support Y" | Search terms + locations checked |
| "X is configured via Y" | Config file or env var example |
| "In version X, Y changed" | Changelog/commit reference |

### Citation Checklist

- [ ] File path included (for code)
- [ ] Line numbers included (for specific code)
- [ ] URL included (for external sources)
- [ ] Date/version included (for time-sensitive claims)
- [ ] Confidence level stated (for non-obvious claims)
- [ ] Search terms documented (for negative claims)

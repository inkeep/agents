# Vercel WAF Hardening — Spec

**Status:** Draft
**Owner(s):** andrew
**Last updated:** 2026-03-19

---

## 1) Problem statement
- **Who is affected:** All Vercel-deployed surfaces — `agents-manage-ui`, `agents-api` preview/production, and `agents-docs`.
- **What pain / job-to-be-done:** The deployments have no WAF rules configured. Automated scanners, vulnerability probes, and brute-force attempts hit the applications unmitigated, wasting compute, polluting logs, and increasing attack surface.
- **Why now:** Preview environments are being stood up (see `2026-03-19-preview-env-auth`); production deployments are public. Basic WAF hardening should be in place before broader usage.
- **Current workaround(s):** Vercel's built-in DDoS mitigation is active (platform-wide, automatic), but no application-level WAF rules exist.

## 2) Goals
- **G1:** Block common vulnerability scanner probes (WordPress, PHP admin, dotfile enumeration) at the edge before they reach the application.
- **G2:** Challenge or deny requests from known scanner user-agents and requests with no user-agent.
- **G3:** Rate-limit authentication endpoints to mitigate brute-force credential attacks.
- **G4:** Rate-limit API routes globally to prevent enumeration and resource exhaustion.
- **G5:** All rules defined in `vercel.json` so they are version-controlled, reviewed in PRs, and deployed automatically.

## 3) Non-goals
- **NG1:** Geo-blocking — our users are global; no region restrictions.
- **NG2:** Managed Rulesets (OWASP Top 10) — requires Enterprise plan; evaluate separately.
- **NG3:** Bot management or advanced fingerprinting (JA3/JA4) — separate initiative.
- **NG4:** WAF rules for the docs site beyond basic scanner blocking — low-risk static content.

## 4) Current state (what happens today)

### What protection exists
- **Vercel platform DDoS mitigation** — automatic, no configuration needed, blocks large-scale volumetric attacks.
- **Vercel Deployment Protection** — preview deployments require Vercel team authentication. Production is public.
- **Application-level auth** — the Manage UI and API require Better Auth sessions or API keys. But the login endpoint itself is unprotected against brute-force.

### What's missing
- No path-based blocking — scanners probing `/wp-admin`, `/.env`, `/phpmyadmin` etc. hit the Next.js/Hono 404 handler, wasting serverless invocations.
- No user-agent filtering — known scanner tools (sqlmap, nikto, nuclei, etc.) are not blocked.
- No rate limiting on `/api/auth/*` — credential stuffing attacks can attempt unlimited logins.
- No global API rate limiting — enumeration of `/api/*` routes is unrestricted.

## 5) Proposed solution

### 5a) Configuration approach

Define WAF rules in `vercel.json` using the `routes[].mitigate` syntax ([available since July 2025](https://vercel.com/changelog/web-application-firewall-control-now-available-with-vercel-json)). This gives us version control, PR review, and automatic deployment.

Rules propagate globally within ~300ms and support instant rollback from the Vercel dashboard.

### 5b) Rule layers

Rules are evaluated in the order they appear in `vercel.json`. The layers below are ordered from most specific (path probes) to most general (global API rate limit).

#### Layer 1: Block vulnerability scanner path probes

Deny requests to paths that our applications never serve. These are the most common automated scanner targets.

```json
{
  "src": "/(wp-admin|wp-login\\.php|wp-content|wp-includes|xmlrpc\\.php)(.*)",
  "mitigate": { "action": "deny" }
}
```

```json
{
  "src": "/(\\.env|\\.git|\\.svn|\\.htaccess|\\.htpasswd|\\.DS_Store)(.*)",
  "mitigate": { "action": "deny" }
}
```

```json
{
  "src": "/(phpmyadmin|adminer|cgi-bin|phpinfo\\.php|server-status)(.*)",
  "mitigate": { "action": "deny" }
}
```

#### Layer 2: Block known scanner user-agents

Deny requests with user-agent strings matching known offensive security tools.

```json
{
  "src": "/(.*)",
  "has": [
    {
      "type": "header",
      "key": "user-agent",
      "value": ".*(sqlmap|nikto|nmap|masscan|zgrab|gobuster|dirbuster|nuclei|httpx|curl/|python-requests|Go-http-client).*"
    }
  ],
  "mitigate": { "action": "deny" }
}
```

#### Layer 3: Challenge requests with no user-agent

Real browsers always send a user-agent. Missing user-agent strongly signals automated tooling. Use `challenge` (not `deny`) to allow edge cases through.

```json
{
  "src": "/(.*)",
  "missing": [
    {
      "type": "header",
      "key": "user-agent"
    }
  ],
  "mitigate": { "action": "challenge" }
}
```

#### Layer 4: Rate-limit authentication endpoints

Mitigate brute-force credential attacks. Allow 10 requests per 60-second window per IP to auth-related paths.

```json
{
  "src": "/(api/auth|login|signin|api/token)(.*)",
  "mitigate": {
    "action": "rate_limit",
    "rateLimit": {
      "window": 60,
      "limit": 10
    }
  }
}
```

#### Layer 5: Rate-limit API routes globally

Prevent API enumeration and resource exhaustion. Allow 100 requests per 60-second window per IP.

```json
{
  "src": "/api/(.*)",
  "mitigate": {
    "action": "rate_limit",
    "rateLimit": {
      "window": 60,
      "limit": 100
    }
  }
}
```

#### Layer 6: Block suspicious query-string payloads

Catch basic SQL injection and path traversal probes at the edge.

```json
{
  "src": ".*(\\.\\./|\\.\\.\\\\|union.*select|<script|%3Cscript|/etc/passwd|cmd\\.exe).*",
  "mitigate": { "action": "deny" }
}
```

### 5c) Rule summary

| Layer | What it catches | Action | False-positive risk |
|-------|----------------|--------|---------------------|
| Path blocklist | WordPress / PHP / dotfile scanners | Deny | Very low — paths we never serve |
| User-agent blocklist | Known scanner tools | Deny | Low — legitimate users don't use sqlmap |
| Missing user-agent | Lazy bots, raw scripts | Challenge | Low — challenge lets real browsers through |
| Auth rate limit | Credential brute-force | Rate limit (10/60s) | Low — 10 login attempts per minute is generous |
| API rate limit | API enumeration, scraping | Rate limit (100/60s) | Medium — monitor and tune |
| Payload inspection | SQLi / XSS / path traversal probes | Deny | Low — patterns are highly specific |

### 5d) Rollout strategy

1. **Phase 1 (immediate):** Deploy all rules with `"action": "log"` to observe traffic patterns without blocking anything. Monitor for 48-72 hours via the Vercel Firewall dashboard.
2. **Phase 2:** Switch path blocklist, user-agent blocklist, and payload inspection rules to `"action": "deny"`. These have near-zero false-positive risk.
3. **Phase 3:** Enable rate limiting on auth endpoints (`rate_limit`). Monitor for legitimate high-frequency auth patterns (e.g., automated tests).
4. **Phase 4:** Enable global API rate limiting. Tune the `limit` threshold based on observed traffic from Phase 1 logs.
5. **Phase 5:** Switch missing user-agent rule to `"action": "challenge"`.

### 5e) Which `vercel.json` files to update

| Project | File | Notes |
|---------|------|-------|
| `agents-api` | `agents-api/vercel.json` | Full rule set — all 6 layers |
| `agents-manage-ui` | `agents-manage-ui/vercel.json` | Layers 1-3 + Layer 6. Auth rate limiting handled by the API. No global API rate limit needed (UI serves pages, not API routes). |
| `agents-docs` | `agents-docs/vercel.json` | Layers 1-3 only. Static docs site — no auth or API endpoints to rate-limit. |

## 6) Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: `vercel.json` rules (proposed)** | Version-controlled, PR-reviewed, zero dashboard dependency, deploys with the app | Limited to `has`/`missing` matchers; no OWASP managed rulesets | **Selected** — best fit for Pro plan, version-control requirement |
| **B: Dashboard-only configuration** | More powerful rule builder UI, real-time editing | Not version-controlled, no PR review, manual drift risk | Rejected — violates G5 |
| **C: Terraform provider** | IaC, version-controlled, supports full WAF API | Adds Terraform dependency to CI/CD; team doesn't use Terraform today | Rejected — unnecessary complexity for current needs |
| **D: Cloudflare / external WAF** | Full-featured WAF, managed rulesets, bot management | Adds another vendor, DNS changes, latency, cost | Rejected — Vercel-native is sufficient for current threat model |

## 7) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria |
|----------|-------------|---------------------|
| Must | Scanner path probes return 403 | `curl -s -o /dev/null -w "%{http_code}" https://<app>/wp-admin` returns `403` |
| Must | Known scanner user-agents are blocked | `curl -A "sqlmap/1.0" https://<app>/` returns `403` |
| Must | Missing user-agent triggers challenge | `curl -H "User-Agent:" https://<app>/` returns `403` (challenge page) |
| Must | Auth endpoints rate-limited to 10/min/IP | 11th request within 60s to `/api/auth/sign-in` returns `429` |
| Must | All rules defined in `vercel.json` | Rules visible in git history; no dashboard-only rules |
| Should | Global API rate limit of 100/min/IP | 101st request within 60s to `/api/*` returns `429` |
| Should | Payload inspection blocks SQLi/XSS probes | `curl "https://<app>/?q=union+select"` returns `403` |

### Non-functional requirements
- **Performance:** Rules evaluated at Vercel edge — no added latency to legitimate requests.
- **Observability:** Blocked/challenged/rate-limited requests visible in the Vercel Firewall dashboard traffic view.
- **Rollback:** Any rule change can be instantly reverted via `git revert` + deploy, or via the Vercel dashboard's instant rollback.

## 8) Plan limits to be aware of

| Feature | Hobby | Pro | Enterprise |
|---------|-------|-----|-----------|
| Custom Rules | 3 | 40 | 1,000 |
| IP Blocking (project) | 10 | 100 | Custom |
| Managed Rulesets | N/A | N/A | Contact sales |
| System Bypass Rules | N/A | 25 | 100 |

On the **Pro plan**, we have up to 40 custom rules per project — more than sufficient for the 6 layers proposed here (each layer is 1-3 rules).

## 9) Files to modify

| File | Change |
|------|--------|
| `agents-api/vercel.json` | Add `routes` array with all 6 rule layers |
| `agents-manage-ui/vercel.json` | Add `routes` array with layers 1-3 + layer 6 |
| `agents-docs/vercel.json` | Add `routes` array with layers 1-3 |

## 10) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positives on user-agent blocklist (e.g., internal tools using `python-requests`) | Medium | Medium — internal tooling blocked | Phase 1 log-only rollout catches this before enforcement. Allowlist specific internal IPs via System Bypass Rules if needed. |
| Rate limit too aggressive for legitimate API consumers | Medium | High — paying users throttled | Start with generous limits (100/min); monitor and tune. SDK/CLI consumers should use API keys which can be allowlisted in a future iteration. |
| `curl/` user-agent block affects legitimate `curl` usage (e.g., health checks, CI) | Medium | Medium — CI smoke tests blocked | Vercel health checks don't go through WAF. CI tests against preview URLs may need a custom user-agent header or IP bypass. |
| New `vercel.json` routes conflict with existing routes/rewrites | Low | High — broken routing | Test in preview deployment first. Vercel evaluates `mitigate` routes before application routes. |
| Payload inspection regex too broad — blocks legitimate query strings | Low | Medium — user requests blocked | Regex patterns are highly specific (SQL keywords, script tags, path traversal). Log-only phase validates. |

## 11) Decision log

| ID | Decision | Status | Rationale |
|----|----------|--------|-----------|
| D1 | Use `vercel.json` for all WAF rules (no dashboard-only rules) | Confirmed | Version control requirement (G5) |
| D2 | Use `challenge` (not `deny`) for missing user-agent | Confirmed | Reduces false-positive risk for legitimate edge cases |
| D3 | Roll out in phases starting with `log` action | Proposed | Standard WAF deployment practice; validates rules before enforcement |
| D4 | Auth rate limit: 10 requests / 60s / IP | Proposed | Generous enough for legitimate use; tight enough to slow brute-force |
| D5 | Global API rate limit: 100 requests / 60s / IP | Proposed | Starting point — tune based on Phase 1 traffic data |

## 12) Open questions

| ID | Question | Priority | Blocking? | Status |
|----|----------|----------|-----------|--------|
| Q1 | Which Vercel plan are we on (Pro vs Enterprise)? Determines custom rule limits and managed ruleset availability. | P1 | No — spec assumes Pro (40 rules); Enterprise unlocks managed rulesets as a follow-up | Open |
| Q2 | Do any internal tools or CI pipelines use `python-requests`, `curl`, or `Go-http-client` user-agents against production URLs? | P1 | No — Phase 1 log-only rollout will surface this | Open |
| Q3 | Should preview deployments have the same WAF rules or different (more permissive) rules? | P2 | No | Open |
| Q4 | Do existing `vercel.json` files in these projects already have `routes` arrays that could conflict? | P1 | Yes — must check before implementation | Open |
| Q5 | What is the actual request volume to auth endpoints today? Needed to validate the 10/min rate limit is appropriate. | P2 | No — Phase 1 logs will answer this | Open |

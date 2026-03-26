---
name: saas-session-recon
description: "Validate whether a SaaS platform's APIs can be accessed using browser session cookies — testing feasibility of a Chrome extension session proxy. Connects to user's authenticated Chrome, enumerates cookies, captures network traffic, tests official and internal APIs with cookie auth, checks Origin/CSRF requirements, and produces a structured findings document with a credential extraction recipe. One platform at a time. Triggers: session recon, cookie auth testing, extension proxy feasibility, SaaS API cookie test, session proxy validation."
argument-hint: "<platform-name> (e.g., 'gmail', 'slack', 'hubspot', 'salesforce')"
---

# SaaS Session Recon

Validate whether a specific SaaS platform's APIs accept browser session cookies for programmatic access. This determines if a Chrome extension can act as an invisible API proxy using the user's existing authenticated session.

**Why this matters:** Enterprise SaaS platforms gate OAuth/app installation behind IT admin approval. If the platform's APIs accept session cookies, a Chrome extension service worker can make `fetch()` calls with `credentials: 'include'` and the browser attaches cookies automatically — no admin approval needed.

## Requirements

| Requirement | Type | If unavailable |
|---|---|---|
| Chrome running + user logged into target platform | Hard | Stop. Ask user to open Chrome and log into the platform. |
| `use-browser` skill available (Claude in Chrome extension) | Hard | Fallback: use `eng:browser` with local browser mode (Playwright MCP Bridge). |
| Platform is one of the known platforms | Adaptable | Proceed with generic discovery workflow (skip platform-specific priors). |

## Browser Tool Surface

This skill uses `use-browser` tools. Key tools for recon:

| Tool | Use for |
|---|---|
| `tabs_context_mcp` | Get tab IDs (ALWAYS call first) |
| `navigate(url, tabId)` | Go to platform pages |
| `read_page(tabId)` | Verify login state, find UI elements |
| `javascript_tool(text, tabId)` | Cookie enumeration, fetch() API tests, localStorage/sessionStorage reads |
| `read_network_requests(tabId, urlPattern)` | Capture API calls the web app makes |
| `read_console_messages(tabId)` | Check for auth errors |
| `computer(action="screenshot")` | Visual evidence capture |

**Critical constraint:** All JavaScript passed to `javascript_tool` MUST use ES5 syntax:
- Use `var` not `const`/`let`
- Use `function(){}` not arrow functions `=>`
- Use string concatenation not template literals
- Use `String.fromCharCode(10)` not `"\n"` for newlines
- For async: store results in `window._result`, retrieve in a follow-up call

## Workflow

### Phase 0: Setup and Platform Identification

1. Identify the target platform from the user's argument. Normalize aliases:
   - "gmail", "google mail", "gcal", "google calendar", "gdrive", "google docs" → **Google Workspace**
   - "outlook", "teams", "onedrive", "o365", "office 365" → **Microsoft 365**
   - "jira", "confluence", "atlassian" → **Jira/Atlassian**
   - Use the canonical name for all others (Slack, GitHub, Linear, Notion, Salesforce, HubSpot, Zendesk)

2. **Load:** `references/platform-intelligence.md` — read the section for the target platform. This contains known cookie names, API endpoints, auth patterns, and CSRF mechanisms from prior research. Treat as "hypotheses to validate," not ground truth.

3. Get browser context:
   - Call `tabs_context_mcp` to get current tab IDs
   - Call `navigate(platformUrl, tabId)` to go to the platform's web app

4. Verify login state:
   - Call `read_page(tabId)` — look for authenticated UI elements (profile avatar, username, dashboard)
   - If not logged in, tell the user: "Please log into [platform] in Chrome, then tell me when you're ready."
   - Take a screenshot for evidence: `computer(action="screenshot")`

5. Create the output directory:
   ```bash
   mkdir -p reports/saas-session-recon/<platform-name>
   ```

---

### Phase 1: Cookie Reconnaissance

**Goal:** Enumerate all cookies for the platform's domain(s) and identify which are auth-relevant.

1. **Get JS-visible cookies** via `javascript_tool`:

```javascript
// ES5 — returns non-HttpOnly cookies
(function() {
  var cookies = document.cookie.split("; ");
  var result = cookies.map(function(c) {
    var parts = c.split("=");
    var name = parts[0];
    var value = parts.slice(1).join("=");
    return {
      name: name,
      valuePrefix: value.substring(0, 10) + "...",
      length: value.length,
      httpOnly: false
    };
  });
  return { count: result.length, cookies: result };
})()
```

2. **Get localStorage and sessionStorage tokens**:

```javascript
// ES5 — check storage for auth tokens
(function() {
  var ls = {};
  var ss = {};
  var i;
  for (i = 0; i < window.localStorage.length; i++) {
    var lk = window.localStorage.key(i);
    var lv = window.localStorage.getItem(lk);
    ls[lk] = { prefix: lv.substring(0, 30), length: lv.length };
  }
  for (i = 0; i < window.sessionStorage.length; i++) {
    var sk = window.sessionStorage.key(i);
    var sv = window.sessionStorage.getItem(sk);
    ss[sk] = { prefix: sv.substring(0, 30), length: sv.length };
  }
  return { localStorage: ls, sessionStorage: ss };
})()
```

3. **Discover HttpOnly cookies AND extract full cookie attributes** — `document.cookie` only returns `name=value` pairs. It does NOT expose HttpOnly, Domain, Path, SameSite, Secure, or Expires/Max-Age. You MUST use `read_network_requests` to get these.

   Navigate to a page and immediately call `read_network_requests(tabId, urlPattern)`. Inspect:
   - **Request `Cookie` headers** — compare with JS-visible cookies to identify HttpOnly-only cookies
   - **Response `Set-Cookie` headers** — these contain the FULL cookie attributes:
     ```
     Set-Cookie: sid=abc123; Domain=.example.com; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=7776000
     ```

   For each auth cookie, extract from `Set-Cookie` headers:
   - `Domain` — which (sub)domains it's scoped to
   - `Path` — which URL paths it's sent to (usually `/` but check)
   - `Secure` — HTTPS-only flag
   - `HttpOnly` — not accessible from JS
   - `SameSite` — None/Lax/Strict (critical for extension compatibility)
   - `Expires` or `Max-Age` — when the cookie expires (session cookies have neither)

   **If you can't find `Set-Cookie` headers** (already-set cookies won't appear in new responses), trigger a fresh set by: clearing cookies for one auth cookie via `javascript_tool` (`document.cookie = "name=; expires=Thu, 01 Jan 1970"`), then refreshing the page to force the platform to re-issue it — capture the `Set-Cookie` in the response. Only do this for non-HttpOnly cookies you can delete from JS.

4. **Classify each cookie:**

| Classification | Indicators |
|---|---|
| **Auth/session** | Names containing: session, sid, token, auth, jwt, csrf, canary, xoxc, sapisid, estsauth |
| **Tracking/analytics** | Names containing: _ga, _gid, _fbp, _gcl, amplitude, mixpanel, segment |
| **Functional** | Names containing: locale, timezone, theme, preferences, consent |
| **Unknown** | Everything else — investigate if it appears in API request headers |

Cross-reference discovered cookies against the platform intelligence priors. Note any unexpected auth cookies not in the prior intelligence.

5. **Multi-domain cookie scoping** — Many platforms use multiple subdomains (e.g., Google: `mail.google.com`, `calendar.google.com`, `drive.google.com`). For each auth cookie, check its `Domain` attribute:
   - Domain = `.google.com` → works across all subdomains
   - Domain = `mail.google.com` → only works for that subdomain
   - Navigate to 2-3 different subdomains of the platform and compare which cookies are sent to each (use `read_network_requests` after each navigation)

6. **SameSite attribute check** — For each auth cookie, note its SameSite value. This matters for extension service worker behavior:
   - `SameSite=None` → sent on cross-origin requests (extension-compatible)
   - `SameSite=Lax` → sent on top-level navigations only (may work for GET from extension, not POST)
   - `SameSite=Strict` → never sent cross-origin (will NOT work from extension service worker)
   - Missing → browser defaults to `Lax` since Chrome 80

   SameSite values are NOT visible from `document.cookie`. Infer from `read_network_requests` response `Set-Cookie` headers, or test behaviorally in Phase 3.

7. **Multi-account detection** — Check if the user has multiple accounts active:

```javascript
// ES5 — detect multi-account indicators
(function() {
  var cookies = document.cookie;
  var multiAccountSignals = [];
  // Google: u/0, u/1 path patterns
  if (window.location.href.indexOf("/u/0") !== -1 || window.location.href.indexOf("/u/1") !== -1) {
    multiAccountSignals.push("Google multi-account (u/N path)");
  }
  // Microsoft: multiple ESTSAUTH cookies
  // Slack: multiple workspace cookies
  // Look for account selector UI
  var accountSwitchers = document.querySelectorAll("[aria-label*='account'], [aria-label*='Account'], [data-testid*='account-switch']");
  if (accountSwitchers.length > 0) {
    multiAccountSignals.push("Account switcher UI detected");
  }
  return { signals: multiAccountSignals, currentUrl: window.location.href };
})()
```

   If multi-account is detected, document: which account's cookies are used for API calls? Does the API response correspond to the expected account?

**Output:** Write cookie inventory to `reports/saas-session-recon/<platform-name>/cookies.md`.

---

### Phase 2: Network Traffic Analysis

**Goal:** Discover which API endpoints the web app calls, what auth each uses, and whether they're official or internal.

1. **Clear network tracking** then navigate through core features:

   ```
   read_network_requests(tabId, clear=True)
   ```

   Navigate to each key area of the platform:
   - Main dashboard / inbox / home
   - List view of primary resources (messages, issues, contacts, documents)
   - Detail view of a single resource
   - Settings or profile page
   - Search (if available)

   After each navigation, capture with:
   ```
   read_network_requests(tabId, urlPattern="/api/", limit=50)
   ```

   Vary the `urlPattern` to catch different API paths:
   - `/api/` — standard REST paths
   - `graphql` — GraphQL endpoints
   - `/v1/`, `/v2/`, `/v3/` — versioned APIs
   - `gateway` — API gateways
   - The platform's known API domain from platform-intelligence.md

2. **Also inject a fetch/XHR interceptor** for calls `read_network_requests` might miss:

```javascript
// ES5 — inject BEFORE navigating to capture all calls
(function() {
  window.__apiCalls = [];
  var origFetch = window.fetch;
  window.fetch = function() {
    var url = typeof arguments[0] === "string" ? arguments[0] : (arguments[0] && arguments[0].url);
    var opts = arguments[1] || {};
    var headers = {};
    if (opts.headers) {
      if (typeof opts.headers.entries === "function") {
        var iter = opts.headers.entries();
        var entry;
        while (!(entry = iter.next()).done) {
          headers[entry.value[0]] = entry.value[1];
        }
      } else {
        for (var k in opts.headers) {
          if (opts.headers.hasOwnProperty(k)) headers[k] = opts.headers[k];
        }
      }
    }
    window.__apiCalls.push({
      type: "fetch",
      url: url,
      method: opts.method || "GET",
      headers: headers,
      credentials: opts.credentials,
      ts: Date.now()
    });
    return origFetch.apply(this, arguments);
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    window.__apiCalls.push({
      type: "xhr",
      url: url,
      method: method,
      ts: Date.now()
    });
    return origOpen.apply(this, arguments);
  };
  return "interceptor installed";
})()
```

   After navigating, harvest:
```javascript
(function() {
  var calls = window.__apiCalls.splice(0);
  return { count: calls.length, calls: calls };
})()
```

3. **For each discovered API endpoint**, record:
   - URL pattern (collapse IDs to `{id}` placeholders)
   - HTTP method
   - Whether it matches the platform's official documented API base URL
   - Any custom headers (especially auth-related: Authorization, X-CSRF-*, X-OWA-CANARY, etc.)

4. **Identify the CSRF mechanism** — check for:

```javascript
// ES5 — look for CSRF meta tags in page HTML
(function() {
  var metas = document.querySelectorAll("meta");
  var csrfMetas = [];
  for (var i = 0; i < metas.length; i++) {
    var name = metas[i].getAttribute("name") || "";
    var content = metas[i].getAttribute("content") || "";
    if (name.toLowerCase().indexOf("csrf") !== -1 || name.toLowerCase().indexOf("token") !== -1) {
      csrfMetas.push({ name: name, contentPrefix: content.substring(0, 20) + "..." });
    }
  }
  // Also check for CSRF in cookies
  var csrfCookies = document.cookie.split("; ").filter(function(c) {
    return c.toLowerCase().indexOf("csrf") !== -1;
  });
  return { metaTags: csrfMetas, csrfCookies: csrfCookies };
})()
```

5. **Check Content-Security-Policy** — CSP `connect-src` directives can block `fetch()` from injected JS to certain API domains. If a test fails from injected JS but works from Bun, CSP may be the cause, not auth.

```javascript
// ES5 — check CSP meta tags and capture CSP header
(function() {
  var cspMetas = [];
  var metas = document.querySelectorAll("meta[http-equiv='Content-Security-Policy']");
  for (var i = 0; i < metas.length; i++) {
    cspMetas.push(metas[i].getAttribute("content"));
  }
  return { cspMetaTags: cspMetas, note: "Also check CSP response header via read_network_requests" };
})()
```

   Also check `read_network_requests` response headers for `Content-Security-Policy` and `Content-Security-Policy-Report-Only`. Look for `connect-src` — if it doesn't include `*` or the API's domain, injected JS fetch will fail.

   **Key distinction:** CSP blocks injected JS but does NOT affect extension service worker `fetch()` (service workers aren't subject to the page's CSP). So a CSP block in browser testing is NOT a problem for the actual extension — document this.

6. **Check for request signing / nonce patterns** — look in captured request headers for:

```javascript
// ES5 — detect signing patterns in captured API calls
(function() {
  var calls = window.__apiCalls || [];
  var signingPatterns = [];
  calls.forEach(function(call) {
    var headers = call.headers || {};
    for (var key in headers) {
      var lower = key.toLowerCase();
      if (lower.indexOf("signature") !== -1 || lower.indexOf("nonce") !== -1 ||
          lower.indexOf("timestamp") !== -1 || lower.indexOf("hash") !== -1 ||
          lower.indexOf("sapisidhash") !== -1 || lower.indexOf("x-goog-authuser") !== -1) {
        signingPatterns.push({ url: call.url, header: key, valuePrefix: headers[key].substring(0, 30) });
      }
    }
  });
  return { count: signingPatterns.length, patterns: signingPatterns };
})()
```

   If signing headers are found, the extension/agent must compute these dynamically — simple cookie replay won't work. Document the formula if known (check platform-intelligence.md) or flag for reverse-engineering.

**Output:** Write API endpoint map to `reports/saas-session-recon/<platform-name>/api-endpoints.md`.

---

### Phase 2.5: Build the API Test Target List

**Goal:** Consolidate everything into a concrete list of specific API endpoints to test. Phase 3 tests each of these — there should be no `<API_URL>` placeholders left.

Build the list from THREE sources:

**Source 1: Platform intelligence priors** — from `references/platform-intelligence.md`, extract:
- Official API base URL (e.g., `https://api.slack.com/api/`, `https://graph.microsoft.com/v1.0/`)
- Known internal API endpoints (e.g., `notion.so/api/v3/getSpaces`, `<site>.atlassian.net/gateway/api/graphql`)
- Known auth patterns (e.g., Salesforce sid as Bearer, Google SAPISIDHASH)

**Source 2: Network traffic discovery** — from Phase 2 captured API calls:
- Group by base URL pattern (collapse resource IDs to `{id}`)
- Identify which are official API calls vs internal/undocumented
- Pick 1-2 representative endpoints per base URL for testing

**Source 3: Official API documentation lookup** — for the platform, find the official API docs:

```bash
# Look up official API base URL from docs
bun -e "
const resp = await fetch('https://www.google.com/search?q=<PLATFORM>+REST+API+documentation+site:docs', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
// Or just use known URLs from platform intelligence
console.log('Check platform docs for API base URL and a simple GET endpoint');
"
```

   Common official API patterns:
   - `api.<platform>.com/v1/` or `/v2/`
   - `<platform>.com/api/v1/`
   - `graph.microsoft.com/v1.0/`
   - `www.googleapis.com/`

   Find ONE simple "identity" endpoint to test first (tells you if auth works without needing to know resource IDs):
   - `/users/me`, `/me`, `/api/v2/users/me.json`, `/v1/me`
   - These require no arguments — just auth

**Build the consolidated test target table:**

| # | Endpoint URL | Type | Source | Test priority | Identity endpoint? |
|---|---|---|---|---|---|
| 1 | `https://api.example.com/v2/users/me.json` | Official | Docs + priors | P0 | Yes |
| 2 | `https://api.example.com/v2/tickets.json` | Official | Priors | P0 | No |
| 3 | `https://app.example.com/api/internal/search` | Internal | Network capture | P1 | No |
| 4 | `https://app.example.com/graphql` | Internal | Network capture | P1 | No |
| ... | ... | ... | ... | ... | ... |

**Test priority rules:**
- **P0:** Identity/me endpoints (simplest test — no resource IDs needed), official API base URL
- **P0:** Any endpoint the web app uses heavily (high-frequency in network capture)
- **P1:** Other discovered endpoints, less-used API paths
- **P2:** Edge cases (admin endpoints, settings, file operations)

**For unknown platforms** (not in platform-intelligence.md):
1. Search for `<platform name> API documentation` and `<platform name> REST API`
2. Look for a developer portal or API reference
3. Find the API base URL and a `/me` or `/users/me` endpoint
4. Fall back entirely on network traffic discovery from Phase 2

**Output:** This table IS the input to Phase 3. Every row gets tested through the gradient. Start with P0 endpoints.

---

### Phase 3: Gradient API Testing (Bun → Injected JS → Extension Implications)

**Goal:** Test each endpoint from the Phase 2.5 target list across three execution contexts, from least to most constrained. This gradient reveals exactly what works, what breaks, and why.

**Why inverted order?** If Bun (full header control) can't make the API work with extracted cookies, nothing else will either. Start with the most permissive context to establish the baseline, then test more constrained contexts to understand what additional restrictions apply.

**Input:** The API test target table from Phase 2.5. Test all P0 endpoints first, then P1 if time allows.

#### Constraint gradient:

| Context | Origin control | Cookie handling | CORS | SameSite |
|---|---|---|---|---|
| **Bun/Node** (test first) | Full control | Manual (extracted values) | N/A | N/A |
| **Injected JS** (test second) | Browser-controlled | `document.cookie` + `credentials: 'include'` | Same-origin free, cross-origin restricted | Browser enforces |
| **Extension service worker** (infer from delta) | `chrome-extension://` (can't override) | `credentials: 'include'` attaches all (incl. HttpOnly) | Subject to CORS | SameSite=Strict blocks |

---

#### Step 3A: Bun/Node Testing (Least Constrained)

Extract cookies from Phase 1 (both JS-visible and HttpOnly cookies from network headers), then test each endpoint from the Phase 2.5 target list starting with the P0 identity endpoint. This tells you: **does cookie auth work at all, independent of browser restrictions?**

First, build a cookie string from Phase 1 findings. For HttpOnly cookies you can't read from `document.cookie`, get the values from `read_network_requests` captured headers.

Start with the **identity endpoint** (e.g., `/users/me`) — it requires no arguments, just auth:

```bash
# Test identity endpoint first — simplest possible auth check
bun -e "
const cookies = '<ALL_AUTH_COOKIES_FROM_PHASE_1>';
const resp = await fetch('<IDENTITY_ENDPOINT_FROM_TARGET_LIST>', {
  headers: {
    'Cookie': cookies,
    'Origin': 'https://<PLATFORM_DOMAIN>',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  }
});
const body = await resp.text();
console.log(JSON.stringify({
  status: resp.status,
  statusText: resp.statusText,
  ok: resp.ok,
  contentType: resp.headers.get('content-type'),
  bodyPreview: body.substring(0, 500),
  wwwAuthenticate: resp.headers.get('www-authenticate')
}, null, 2));
"
```

**Bun test matrix** — run for EACH discovered API endpoint (official and internal):

| Test | Headers | What it tells you |
|---|---|---|
| GET + cookies + correct Origin | `Origin: https://<platform>` | Baseline: does cookie auth work? |
| GET + cookies + wrong Origin | `Origin: https://evil.com` | Does the API validate Origin? |
| GET + cookies + no Origin | Omit Origin header | Does the API require Origin? |
| GET + cookies + extension Origin | `Origin: chrome-extension://abcd1234` | Would extension service worker work? |
| GET + cookies + CSRF header | Add CSRF from Phase 2 | Does the API require CSRF for reads? |
| POST + cookies + CSRF + correct Origin | Full auth | Does cookie auth work for writes? |
| GET without cookies | Omit Cookie header | Confirm it fails — proves cookies are doing the auth |

**Important:** For POST/PUT/DELETE tests, use **safe, non-destructive operations** (search endpoints, draft/preview, validation). Ask the user before testing writes that create real data.

**If Bun test fails** with correct Origin + all cookies: check for **session binding**. The platform may bind sessions to:
- **IP address** — unlikely to differ if Bun runs on the same machine, but check if VPN/proxy is involved
- **User-Agent** — try matching the exact browser User-Agent string from `read_network_requests`
- **TLS fingerprint** — Bun's TLS stack differs from Chrome's; some platforms (Cloudflare, Akamai) fingerprint TLS
- **Device-bound session credentials (DBSC)** — Chrome's DBSC ties cookies to a specific browser's TPM-bound key

Test each by varying one header at a time:
```bash
# Test with exact browser User-Agent (copy from read_network_requests)
bun -e "
const resp = await fetch('<API_URL>', {
  headers: {
    'Cookie': '<COOKIES>',
    'Origin': 'https://<PLATFORM>',
    'User-Agent': '<EXACT_BROWSER_UA_STRING>',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty'
  }
});
console.log(resp.status, resp.statusText);
"
```

If it still fails after matching all headers, the session is truly browser-bound. Document this — the extension must use `credentials: 'include'` (service worker direct) and CANNOT extract cookies for agent-process use.

**If Bun test succeeds**: you've confirmed cookie auth works outside the browser. Now isolate the **minimum viable cookie set**:

```bash
# Test with EACH auth cookie individually to find which are required
# Start with the most likely session cookie alone
bun -e "
const resp = await fetch('<API_URL>', {
  headers: {
    'Cookie': '<SINGLE_COOKIE_NAME>=<VALUE>',
    'Origin': 'https://<PLATFORM>',
    'Accept': 'application/json'
  }
});
console.log('Single cookie:', resp.status);
"
```

   Binary-search the cookie set: start with all cookies (works), remove half, test. Repeat until you find the minimum set. This is critical for the credential extraction recipe — extracting 2 cookies vs 15 cookies is a different engineering problem.

**Error response fingerprinting** — For EVERY failed request (non-2xx), record the exact error shape:

```bash
# Capture full error details for failed requests
bun -e "
const resp = await fetch('<API_URL>', {
  headers: { 'Accept': 'application/json' }  // NO cookies
});
const body = await resp.text();
console.log(JSON.stringify({
  status: resp.status,
  statusText: resp.statusText,
  contentType: resp.headers.get('content-type'),
  wwwAuthenticate: resp.headers.get('www-authenticate'),
  xError: resp.headers.get('x-error') || resp.headers.get('x-error-code'),
  bodyPreview: body.substring(0, 1000)
}, null, 2));
"
```

Document the error fingerprint per platform — the agent needs to distinguish "auth failed" from "rate limited" from "not found" from "forbidden." Each platform returns different error shapes.

---

#### Step 3B: Injected JS Testing (Browser Context)

Now test from inside the page via `javascript_tool`. Compare results with Bun to identify browser-specific constraints.

```javascript
// ES5 — test API from browser context
(function() {
  var url = "<API_URL>";
  fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { "Accept": "application/json" }
  })
  .then(function(resp) {
    return resp.text().then(function(body) {
      window._browserTest = {
        status: resp.status,
        statusText: resp.statusText,
        ok: resp.ok,
        bodyPreview: body.substring(0, 500)
      };
    });
  })
  .catch(function(e) {
    window._browserTest = { error: e.message };
  });
  return "fetching...";
})()
```

Then retrieve: `window._browserTest`

**Browser-specific tests:**

1. **Same-origin vs cross-origin** — test APIs on the same domain (no Origin sent) and different domains (browser sends real Origin). Compare with Bun results.

2. **SameSite behavioral test** — if you're on `mail.google.com`, try fetching from `clients6.google.com` (different subdomain). If Bun succeeded but browser fails here, SameSite is blocking.

3. **CORS preflight check** — POST with `Content-Type: application/json` triggers preflight:

```javascript
// ES5 — test POST (triggers CORS preflight for cross-origin)
(function() {
  fetch("<CROSS_ORIGIN_API_URL>", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({})
  })
  .then(function(r) {
    window._corsTest = { status: r.status, ok: r.ok };
  })
  .catch(function(e) {
    window._corsTest = { error: e.message, note: "CORS preflight likely blocked" };
  });
  return "testing CORS...";
})()
```

4. **Response format check** — flag non-JSON responses:

```javascript
// ES5 — check content types across key endpoints
(function() {
  var urls = [/* 3-5 key API endpoints from Phase 2 */];
  var results = [];
  var done = 0;
  urls.forEach(function(url) {
    fetch(url, { credentials: "include" })
      .then(function(r) {
        results.push({
          url: url,
          contentType: r.headers.get("content-type"),
          isJson: (r.headers.get("content-type") || "").indexOf("json") !== -1
        });
        done++;
        if (done === urls.length) window._formatCheck = results;
      });
  });
  return "checking formats...";
})()
```

---

#### Step 3C: Delta Analysis (Bun vs Browser → Extension Implications)

Compare Bun and browser results to build the extension compatibility matrix:

| Endpoint | Bun result | Browser result | Delta | Extension implication |
|---|---|---|---|---|
| Official API GET | ? | ? | ? | ? |
| Official API POST | ? | ? | ? | ? |
| Internal API GET | ? | ? | ? | ? |
| Internal API POST | ? | ? | ? | ? |

**Interpret the delta:**

| Bun | Browser | What it means | Extension approach |
|---|---|---|---|
| Works | Works | Cookie auth works everywhere | Service worker `fetch()` with `credentials: 'include'` |
| Works | CORS blocked | API doesn't set CORS headers for browser | Service worker may bypass (SW has relaxed CORS); OR extract cookies → agent process via Bun |
| Works | SameSite blocked | Cookies not sent cross-origin in browser | Service worker with `host_permissions` overrides SameSite; test needed |
| Works | Origin rejected | API validates Origin and browser sends wrong one | Extract cookies → agent process (Bun) via native messaging |
| Fails | Works | Browser-binding (DBSC?) or missing HttpOnly cookies | Service worker direct only (can't extract) |
| Fails | Fails | Cookie auth doesn't work for this API | Use official OAuth/API tokens instead |

**Also test from Bun with extension-like Origin:**

```bash
# Simulate extension service worker Origin
bun -e "
const resp = await fetch('<API_URL>', {
  headers: {
    'Cookie': '<COOKIES>',
    'Origin': 'chrome-extension://abcdefghijklmnop',
    'Accept': 'application/json'
  }
});
console.log('Status:', resp.status, resp.statusText);
"
```

**CORS preflight for extension origin:**

```bash
# Simulate CORS preflight from extension
curl -s -D - -X OPTIONS \
  -H "Origin: chrome-extension://fake-extension-id" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  "<API_URL>" 2>&1 | head -30
```

Check for `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Methods`.

**Document for each API endpoint:**
- Which execution context works (Bun / browser / both / neither)
- What restrictions the browser adds (CORS, SameSite, Origin)
- Recommended architecture for extension (service worker direct / cookie extraction to agent process / hybrid)

---

### Phase 4: CRUD Coverage Testing

**Goal:** Using the working execution context(s) identified in Phase 3, test what CRUD operations are available.

Use whichever context worked in Phase 3 (prefer Bun for simplicity if it works).

1. **Compare official vs internal API access.** If the official API rejects cookies but the internal API accepts them, this is a key finding — the extension must use the internal API.

2. **Test CRUD coverage:**
   - **Read:** List/get operations (always test first)
   - **Create:** Only with user confirmation
   - **Update:** Only with user confirmation on a test resource
   - **Delete:** Only with explicit user confirmation, and only resources YOU created

3. **Document the minimum credential set** for each endpoint:
   - Cookies only? Which specific cookies?
   - Cookies + specific header? Which header, where does its value come from?
   - Any other requirements (Content-Type, Accept, Origin)?

---

### Phase 5: Credential Extraction Recipe

**Goal:** Document exactly what a Chrome extension needs to extract and how the agent process should use it.

Based on findings from Phases 1-4, write the recipe:

1. **What to extract:** List specific cookies/tokens by name:
   - Is it HttpOnly? (If yes, `chrome.cookies` API can read it but `document.cookie` cannot)
   - Is it needed as a cookie in the request, or as a header value?
   - Does it need to be combined with anything else? (e.g., SAPISIDHASH computation)

2. **How to make the API call:** Specify exactly:
   - API URL pattern
   - Required headers (Authorization, CSRF, Content-Type, Origin, etc.)
   - Whether to use `credentials: 'include'` (send cookies) or extract-and-inject
   - Request body format (JSON, form-encoded, etc.)

3. **Extension vs agent process — classify the approach:**
   - **Service worker direct** — extension `fetch()` with `credentials: 'include'` works (most platforms)
   - **Cookie extraction + agent process** — extension extracts cookie, passes to agent via native messaging, agent makes API call with Origin set freely (needed when Origin validation exists, e.g., Google)
   - **Token extraction** — extract token value from cookie/localStorage, use as Bearer token (e.g., Salesforce `sid`)

---

### Phase 6: Session Durability & Token Rotation

**Goal:** Determine how long cookie-based access lasts, what triggers re-auth, and whether tokens rotate mid-session.

1. **Check cookie expirations** from Phase 1 `Set-Cookie` data (step 3):
   - No `Expires`/`Max-Age` → session cookie, dies when browser closes
   - `Max-Age=7776000` → 90 days
   - `Max-Age=300` → 5 minutes (short-lived, needs refresh — e.g., HubSpot)
   - `Expires=<date>` → check if absolute or sliding

   Build an expiration table:

   | Cookie | Expires/Max-Age | Effective lifetime | Session or persistent? |
   |---|---|---|---|
   | ... | ... | ... | ... |

2. **Trace the client-side refresh flow** — this is critical. Look in Phase 2 network captures for requests that RETURN new cookies. These are the session refresh mechanism.

   Filter `read_network_requests` for responses containing `Set-Cookie` headers on auth cookie names:
   ```
   read_network_requests(tabId, urlPattern="token")
   read_network_requests(tabId, urlPattern="refresh")
   read_network_requests(tabId, urlPattern="auth")
   read_network_requests(tabId, urlPattern="session")
   ```

   For each refresh endpoint found, document:
   - URL and HTTP method
   - What triggers it (timer? page navigation? API 401 response?)
   - What it sends (old cookies? refresh token? nothing?)
   - What it returns (new cookie values via `Set-Cookie`)
   - Interval (how often does the web app call it?)

   **Why this matters:** If the platform rotates session cookies every 5 minutes via a refresh endpoint, the extension must replicate this call. If it doesn't, extracted cookies expire after 5 minutes even though the user's browser session appears "active."

3. **Also check for heartbeat/keepalive** from Phase 2 data — look for periodic requests to URLs containing: heartbeat, keepalive, ping, alive, extend. These may keep sessions alive without rotating cookies.

3. **Token rotation check** — some platforms rotate cookie values mid-session (e.g., HubSpot's 5-min `hubspotapi` cookie). This breaks extracted-credential approaches where the agent process holds a stale token.

```javascript
// ES5 — snapshot cookie values for rotation detection
(function() {
  var snapshot = {};
  document.cookie.split("; ").forEach(function(c) {
    var parts = c.split("=");
    snapshot[parts[0]] = parts.slice(1).join("=").substring(0, 20);
  });
  window._cookieSnapshot1 = { ts: Date.now(), cookies: snapshot };
  return "snapshot 1 taken at " + new Date().toISOString();
})()
```

   Wait 2-5 minutes, then take a second snapshot and compare:

```javascript
// ES5 — compare snapshots for rotation
(function() {
  var snapshot = {};
  document.cookie.split("; ").forEach(function(c) {
    var parts = c.split("=");
    snapshot[parts[0]] = parts.slice(1).join("=").substring(0, 20);
  });
  var s1 = window._cookieSnapshot1;
  var rotated = [];
  for (var name in snapshot) {
    if (s1.cookies[name] && s1.cookies[name] !== snapshot[name]) {
      rotated.push(name);
    }
  }
  return {
    elapsed: Date.now() - s1.ts,
    rotatedCookies: rotated,
    newCookies: Object.keys(snapshot).filter(function(k) { return !s1.cookies[k]; }),
    removedCookies: Object.keys(s1.cookies).filter(function(k) { return !snapshot[k]; })
  };
})()
```

   **If rotation detected:** Document which cookies rotate, approximate rotation interval, and implication for credential extraction (must re-extract on every call? or can cache for N minutes?).

4. **Test session refresh** (if time permits):
   - Make an API call, wait a few minutes, make another
   - Check if cookie values changed (compare Phase 1 cookies before/after)

5. **Document what the user will experience:** How often must they be "actively logged in" to the platform in Chrome for the extension proxy to work?

---

### Phase 7: Detection & Rate Limiting

**Goal:** Assess whether cookie-authenticated API calls look different from normal browser activity.

1. **Test rate limiting** via `javascript_tool`:

```javascript
// ES5 — 10 rapid GET requests
(function() {
  var url = "<TEST_API_URL>";
  var results = [];
  var count = 0;
  function doFetch() {
    var start = Date.now();
    fetch(url, { credentials: "include", headers: { "Accept": "application/json" } })
      .then(function(r) {
        var headers = {};
        r.headers.forEach(function(v, k) { headers[k] = v; });
        results.push({ i: count, status: r.status, elapsed: Date.now() - start, headers: headers });
        count++;
        if (count < 10) { doFetch(); }
        else { window._rateTest = results; }
      })
      .catch(function(e) {
        results.push({ i: count, error: e.message });
        window._rateTest = results;
      });
  }
  doFetch();
  return "testing rate limits...";
})()
```

   Then retrieve: `window._rateTest`

2. **Check rate limit headers** in the results:
   - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
   - `Retry-After`
   - Platform-specific headers (Slack: `X-Slack-Req-Id`, GitHub: `X-RateLimit-*`)

3. **Compare request fingerprint** — use `read_network_requests` to compare headers sent by the web app's own API calls vs your fetch() calls. Look for missing `Sec-Fetch-*`, `Referer`, or `X-Requested-With` headers.

4. **Document:** Are cookie-authenticated requests treated differently for rate limiting? Any fingerprinting signals?

---

### Phase 8: Capability Mapping

**Goal:** Map what CRUD operations are available via cookie-authenticated APIs.

1. **List the platform's core resources** (based on what the web app interacts with):

   | Resource | Read | Create | Update | Delete | API Used |
   |----------|:----:|:------:|:------:|:------:|----------|
   | Messages/emails | ? | ? | ? | ? | |
   | Contacts/users | ? | ? | ? | ? | |
   | Documents/files | ? | ? | ? | ? | |
   | Issues/tickets | ? | ? | ? | ? | |
   | Comments | ? | ? | ? | ? | |
   | Settings | ? | ? | ? | ? | |

2. **Test read operations** for each resource type via the working API path (official or internal).

3. **Compare with official API documentation:** Are there operations available via cookie auth that require higher OAuth scopes? Are there operations the official API exposes that the internal API doesn't?

4. **Note admin-only operations:** Which operations fail with a regular user's session? These indicate admin-gated permissions regardless of auth method.

---

### Phase 9: Write Findings Document

Compile all results into a structured findings document.

**Output directory:** `reports/saas-session-recon/<platform-name>/`

Create the directory and write the findings:

```bash
mkdir -p reports/saas-session-recon/<platform-name>/evidence
```

**Files to produce:**
- `reports/saas-session-recon/<platform-name>/FINDINGS.md` — the structured report below
- `reports/saas-session-recon/<platform-name>/evidence/` — screenshots and raw evidence captured during the recon

Use this template for FINDINGS.md:

```markdown
# Session Recon: <Platform Name>

**Date:** YYYY-MM-DD
**Platform URL:** <url tested>
**User role:** <user's role/permissions level in the platform>

---

## Executive Summary

<2-3 sentences: Can this platform's APIs be accessed via session cookies? What's the recommended architecture (service worker direct / hybrid / agent-process only)? Key caveats.>

## Cookie Inventory

| Cookie | Domain | HttpOnly | Secure | SameSite | Expires | Purpose | Auth-relevant? |
|--------|--------|:--------:|:------:|:--------:|---------|---------|:--------------:|
| ... | ... | ... | ... | ... | ... | ... | ... |

**Minimum auth cookie set:** <list the specific cookies needed for API access>

**localStorage/sessionStorage tokens:** <any auth-relevant tokens found>

## API Endpoint Map

### Official API

| Endpoint | Method | Cookie Auth? | CSRF Required? | Notes |
|----------|--------|:------------:|:--------------:|-------|
| ... | ... | ... | ... | ... |

### Internal API

| Endpoint | Method | Cookie Auth? | CSRF Required? | Notes |
|----------|--------|:------------:|:--------------:|-------|
| ... | ... | ... | ... | ... |

## Gradient Test Results (Bun → Browser → Extension)

| Endpoint | Bun (cookies + correct Origin) | Bun (no Origin) | Bun (extension Origin) | Browser (injected JS) | Extension implication |
|---|---|---|---|---|---|
| Official API GET | ? | ? | ? | ? | ? |
| Official API POST | ? | ? | ? | ? | ? |
| Internal API GET | ? | ? | ? | ? | ? |
| Internal API POST | ? | ? | ? | ? | ? |

**Device-bound session check:** <Bun works with extracted cookies: Yes/No. If No, sessions are browser-bound (DBSC).>

## Extension Context Compatibility

| Factor | Status | Impact |
|--------|--------|--------|
| SameSite cookie restrictions | <None/Lax blocks POST/Strict blocks all> | <what breaks> |
| CORS preflight for extension origin | <Passes/Fails/N/A> | <what breaks> |
| Non-JSON response formats | <None/protobuf/HTML/other> | <parsing needed> |
| Multi-account behavior | <Single/Multi detected> | <which account used> |

## Auth Error Fingerprints

| Platform Response | Meaning | Status | Body Pattern |
|---|---|---|---|
| Auth missing/expired | <what it looks like> | <status code> | <body snippet> |
| CSRF missing/invalid | <what it looks like> | <status code> | <body snippet> |
| Rate limited | <what it looks like> | <status code> | <body snippet> |
| Forbidden (permission) | <what it looks like> | <status code> | <body snippet> |

## Credential Extraction Recipe

### For Chrome Extension Service Worker (if Origin not validated):
1. <step-by-step: what to extract, how to make the API call>

### For Agent Process via Native Messaging (if Origin validated):
1. <step-by-step: what to extract, how to pass to agent, how agent makes the call>

## Minimum Viable Cookie Set

| Cookie | Required? | How tested |
|---|---|---|
| ... | Yes/No | Removed and API call succeeded/failed |

**Minimum set:** <list of only the cookies actually needed>

## Session Durability

| Cookie | Expires/Max-Age | Effective lifetime | Rotates? | Refresh endpoint |
|---|---|---|---|---|
| ... | ... | ... | Yes (interval)/No | URL or N/A |

- **Session binding:** <None / IP / User-Agent / TLS fingerprint / DBSC>
- **Refresh mechanism:** <endpoint URL, interval, what triggers it>
- **Re-auth frequency:** <how often user needs to be logged in>

## Cookie Scoping

| Cookie | Domain Attribute | Cross-subdomain? | SameSite | Extension-compatible? |
|--------|-----------------|:-----------------:|:--------:|:--------------------:|
| ... | ... | ... | ... | ... |

## Detection Risk

- **Rate limits:** <observed limits, header names>
- **Fingerprinting:** <any detected>
- **Differences from normal browser:** <any observed>

## Capability Matrix

| Resource | Read | Create | Update | Delete | API | Notes |
|----------|:----:|:------:|:------:|:------:|-----|-------|
| ... | ... | ... | ... | ... | ... | ... |

## Architecture Recommendation

<Service worker only / Hybrid (extension + agent process) / Agent process only>

**Confidence:** <CONFIRMED / INFERRED / UNCERTAIN>

## Comparison with Prior Intelligence

<What matched our prior research? What was different? What was new?>

## Open Questions

- <Things that couldn't be validated in this session>
```

---

## Safety Rules

- **Read before write.** Always test GET/read operations before attempting any create/update/delete.
- **Never delete real user data.** Only delete resources you created during this recon session, and only with user confirmation.
- **Ask before writes.** Before any POST/PUT/DELETE that creates or modifies data, describe what you'll do and get user confirmation.
- **Don't exfiltrate credentials.** Cookie values and tokens appear in findings only as prefixes (first 10 chars + `...`). Never log full credential values.
- **One platform at a time.** Don't navigate to other platforms during the recon.

## Completing the Recon

1. Create the output directory: `mkdir -p reports/saas-session-recon/<platform-name>/evidence`
2. Save all screenshots captured during the recon to `reports/saas-session-recon/<platform-name>/evidence/`
3. Write `reports/saas-session-recon/<platform-name>/FINDINGS.md` using the template above
4. Present the executive summary and architecture recommendation to the user
5. Offer to run follow-up tests on specific endpoints or edge cases

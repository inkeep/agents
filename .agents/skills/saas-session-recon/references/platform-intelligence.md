Use when: Starting recon on any of the 10 known platforms — provides prior research to guide cookie/API discovery
Priority: P0
Impact: Without this, agent starts from zero and may miss known auth cookies, internal API endpoints, or CSRF mechanisms

---

# Platform Intelligence (Prior Research)

This file contains known details per platform from prior research (as of March 2026). Treat these as **hypotheses to validate**, not ground truth — platforms change their auth mechanisms. The recon should independently confirm everything.

---

## Google Workspace (Gmail, Calendar, Drive, Docs)

**Domains:** `mail.google.com`, `calendar.google.com`, `drive.google.com`, `docs.google.com`, `accounts.google.com`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| `SAPISID` | **No** | Used for SAPISIDHASH computation. Accessible via `chrome.cookies` AND `document.cookie`. |
| `SID` | Yes | Primary session cookie |
| `HSID` | Yes | HTTP-only session cookie |
| `SSID` | Yes | Secure session cookie |
| `APISID` | No | API session ID |
| `__Secure-1PSID` | Yes | Secure primary session |
| `__Secure-3PSID` | Yes | Cross-site session |

**SAPISIDHASH mechanism (critical):**
- Google's internal APIs validate the Origin header server-side
- Formula: `SAPISIDHASH = timestamp + "_" + SHA1(timestamp + " " + SAPISID + " " + origin)`
- The `origin` in the hash MUST match the Origin header sent with the request
- Chrome extensions CANNOT set the Origin header (forbidden header per Fetch spec)
- **Architecture implication:** Extension extracts SAPISID → passes to agent process via native messaging → agent computes SAPISIDHASH with `Origin: https://mail.google.com` → agent makes API call (Python/Node can set Origin freely)

**Known internal API endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `people-pa.clients6.google.com` | People/contacts API |
| `clients6.google.com` | General internal API |
| `mail.google.com/mail/u/0/` (various endpoints) | Gmail internal |
| `www.googleapis.com/calendar/v3/` | Calendar (official, but internal auth path exists) |

**Official API:** `https://www.googleapis.com/` — requires OAuth tokens, does NOT accept session cookies.

**Prior finding:** GHunt and ytmusicapi prove SAPISIDHASH works from Python. Google DBSC (Device Bound Session Credentials) may tie sessions to specific browser — test whether extracted cookies work outside the browser context.

**What to validate:**
- [ ] SAPISID cookie is present and not HttpOnly (can be extracted via `chrome.cookies`)
- [ ] SAPISIDHASH formula works with extracted cookie + correct Origin
- [ ] Which internal API endpoints are reachable with SAPISIDHASH auth
- [ ] Whether DBSC blocks cookie reuse outside the original browser
- [ ] Official googleapis.com API rejects session cookies (confirm)

---

## Microsoft 365 (Outlook, Teams, OneDrive)

**Domains:** `outlook.office.com`, `outlook.office365.com`, `teams.microsoft.com`, `onedrive.live.com`, `login.microsoftonline.com`, `substrate.office.com`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| `ESTSAUTH` | Yes | Azure AD session token |
| `ESTSAUTHPERSISTENT` | Yes | Persistent Azure AD session |
| `X-OWA-CANARY` | Check | CSRF token for OWA API (may be obtainable from cookie jar) |
| `ClientId` | Check | Client identifier |

**Known API endpoints:**
| Endpoint | Purpose | Auth |
|----------|---------|------|
| OWA API (`outlook.office.com/owa/...`) | Mail, calendar | Session cookies + X-OWA-CANARY header |
| Substrate API (`substrate.office.com/api/v2/`) | Search, mail operations | Session cookies |
| Graph API (`graph.microsoft.com/v1.0/`) | Official API | OAuth Bearer token (likely rejects cookies) |

**Cookie-Bite proof (April 2025):** Varonis demonstrated that stealing ESTSAUTH + ESTSAUTHPERSISTENT cookies → full Microsoft Graph API access, bypassing MFA for up to 90 days.

**CSRF:** X-OWA-CANARY is the CSRF token for OWA. Prior research indicates it's obtainable from the cookie jar itself (not only from page HTML).

**What to validate:**
- [ ] ESTSAUTH/ESTSAUTHPERSISTENT cookies are present
- [ ] X-OWA-CANARY: is it a cookie or only a page-embedded value?
- [ ] OWA API accepts session cookies + X-OWA-CANARY for GET/POST
- [ ] Substrate API accepts session cookies
- [ ] Graph API: does it accept session cookies? (Cookie-Bite suggests yes — validate)
- [ ] Session duration (prior research: up to 90 days)

---

## Slack

**Domains:** `app.slack.com`, `api.slack.com`, `<workspace>.slack.com`

**Known auth cookies/tokens:**
| Token/Cookie | HttpOnly | Purpose |
|---|:---:|---|
| `xoxc-*` token | No | User token. May be in cookies or localStorage. |
| `d` cookie | Yes | Session cookie. Required alongside xoxc token. |
| `d-s` cookie | Check | Session-related |
| `lc` cookie | Check | Session-related |

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| `api.slack.com/api/*` (official Web API) | `xoxc-` token + `d` cookie |
| `api.slack.com/api/conversations.history` | Same |
| `api.slack.com/api/users.list` | Same |

**Key detail:** Slack's official Web API at `api.slack.com` IS the same API the web app uses. The `xoxc-` token acts as the user token, and the `d` cookie provides session binding.

**What to validate:**
- [ ] Where `xoxc-` token is stored (cookies? localStorage? sessionStorage?)
- [ ] `d` cookie is present and HttpOnly
- [ ] `fetch('https://api.slack.com/api/conversations.list', { credentials: 'include' })` works with token + cookies
- [ ] How to pass the xoxc token (as form data `token=xoxc-...` or as query param?)
- [ ] Rate limits on cookie-authenticated calls vs bot token calls

---

## Salesforce

**Domains:** `<instance>.salesforce.com`, `<instance>.lightning.force.com`, `login.salesforce.com`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| `sid` | Check | Session ID. Works directly as Bearer token for REST API. |
| `oid` | Check | Organization ID |

**Key finding:** Salesforce `sid` cookie works as a Bearer token:
```
Authorization: Bearer <sid_cookie_value>
```
This means the extension can extract `sid` and use it in an Authorization header rather than relying on `credentials: 'include'`.

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| `<instance>.salesforce.com/services/data/vXX.0/` | Bearer token (sid works) |
| `<instance>.salesforce.com/services/data/vXX.0/sobjects/` | Same |
| `<instance>.salesforce.com/services/data/vXX.0/query/` | Same |

**What to validate:**
- [ ] `sid` cookie is present — is it HttpOnly?
- [ ] `sid` works as Bearer token for official REST API
- [ ] `credentials: 'include'` alone works (or must extract sid explicitly?)
- [ ] Which Salesforce API version is active (v59.0? v60.0?)
- [ ] Lightning vs Classic: different cookie/API patterns?

---

## Zendesk

**Domains:** `<subdomain>.zendesk.com`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| Session cookie | Check | Main session (name varies) |
| CSRF cookie | Check | CSRF protection |

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| `<subdomain>.zendesk.com/api/v2/` (official REST) | Session cookie for GET; CSRF token for writes |
| `<subdomain>.zendesk.com/api/v2/users/me.json` | Session cookie (also source of CSRF token) |
| `<subdomain>.zendesk.com/api/v2/tickets.json` | Session cookie + CSRF for POST |

**Key detail:** Zendesk's official `/api/v2/` REST API accepts session cookies. This is the OFFICIAL API, not an internal one — making it more durable.

**CSRF:** Token obtainable from `/api/v2/users/me.json` response or from a cookie. Needed for POST/PUT/DELETE.

**What to validate:**
- [ ] Which specific cookie is the session cookie (name varies by deployment)
- [ ] GET requests work with session cookie only
- [ ] POST/PUT/DELETE require CSRF — where exactly is it obtained?
- [ ] Does CSRF come from a cookie (double-submit) or from API response?
- [ ] Are there rate limit differences vs API token auth?

---

## Notion

**Domains:** `www.notion.so`, `notion.so`, `api.notion.com`

**Known auth cookies/tokens:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| `token_v2` | Check | Primary session token |
| `notion_user_id` | Check | User identifier |

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| `notion.so/api/v3/` (internal) | `token_v2` cookie |
| `notion.so/api/v3/getSpaces` | Same |
| `notion.so/api/v3/loadPageChunk` | Same |
| `notion.so/api/v3/submitTransaction` | Same (for writes) |
| `api.notion.com/v1/` (official) | Bearer token (integration secret) |

**Key detail:** The internal API at `notion.so/api/v3/` provides access to ALL pages the user can access — no manual page-sharing required (unlike official integration tokens). This is well-documented by community tools (notion-py, react-notion).

**Advantage over official API:** Official internal integration tokens only access pages explicitly shared with the integration. Cookie-based internal API access mirrors the user's actual permissions — every page they can see in the Notion UI.

**What to validate:**
- [ ] `token_v2` cookie is present — is it HttpOnly?
- [ ] Internal API at `notion.so/api/v3/getSpaces` works with token_v2
- [ ] Can list all accessible pages without manual sharing
- [ ] `submitTransaction` works for writes (test with user confirmation)
- [ ] Official API at `api.notion.com/v1/` rejects session cookies (confirm)
- [ ] Any CSRF requirements for writes on internal API

---

## HubSpot

**Domains:** `app.hubspot.com`, `api.hubapi.com`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| `hubspotapi` | Check | Session cookie (~5 min, extended 7-28 days via refresh) |
| `hubspotapi-csrf` | Check | CSRF protection cookie |
| `hubspotutk` | Check | Tracking (NOT auth) |
| `__hstc` | No | Tracking (NOT auth) |

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| Internal API (various paths under app.hubspot.com) | `hubspotapi` + `hubspotapi-csrf` cookies |
| `api.hubapi.com/` (official) | Private app token / OAuth Bearer |

**Key detail:** HubSpot uses `internal-cookie` authentication for its web app's API calls. The `hubspotapi` session cookie is short-lived (~5 min) but automatically extended.

**What to validate:**
- [ ] `hubspotapi` and `hubspotapi-csrf` cookies are present
- [ ] Internal API endpoints used by the web app (discover via network capture)
- [ ] Whether `credentials: 'include'` to internal endpoints works
- [ ] Session refresh behavior (how the 5-min cookie gets extended)
- [ ] Official `api.hubapi.com` rejects session cookies (confirm)
- [ ] CSRF mechanism: double-submit pattern with `hubspotapi-csrf` cookie?

---

## Jira / Atlassian

**Domains:** `<site>.atlassian.net`, `id.atlassian.com`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| `cloud.session.token` | Check | Atlassian Cloud session |
| `tenant.session.token` | Check | Tenant-specific session |
| CSRF cookie | Check | CSRF protection |

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| `<site>.atlassian.net/gateway/api/graphql` (internal GraphQL) | Session cookies |
| `<site>.atlassian.net/rest/api/3/` (official REST) | Basic Auth (email:token) or OAuth |
| `<site>.atlassian.net/rest/api/3/search` | Same |

**Key detail:** The official REST API deprecated cookie auth in 2019 and requires API tokens or OAuth. However, the internal GraphQL gateway (used by Jira's own UI) still accepts session cookies. This is the gateway at `/gateway/api/graphql`.

**What to validate:**
- [ ] Which cookies constitute the session (cloud.session.token? tenant.session.token? others?)
- [ ] Official REST API at `/rest/api/3/` rejects session cookies (confirm)
- [ ] Internal GraphQL gateway at `/gateway/api/graphql` accepts session cookies
- [ ] CSRF requirements for the GraphQL gateway (POST requests)
- [ ] What queries/mutations are available on the GraphQL gateway
- [ ] Rate limits on cookie-authenticated GraphQL calls

---

## GitHub

**Domains:** `github.com`, `api.github.com`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| `_gh_sess` | Check | Session cookie |
| `user_session` | Check | User session |
| `__Host-user_session_same_site` | Check | SameSite session |
| CSRF token | Check | In page HTML, also in cookies |

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| `api.github.com/` (official REST) | PAT or OAuth Bearer |
| `github.com/` (internal, various JSON endpoints) | Session cookies + CSRF |

**Key detail:** GitHub's classic PAT (`ghp_`) provides a much simpler path (3 min, self-service). The extension proxy approach adds no value over PATs for GitHub. However, if the org blocks PATs, cookie-based internal API access with CSRF bootstrapping is the fallback.

**Recommendation:** Use PAT. Only investigate cookie-based access if PATs are blocked.

**What to validate (only if PAT path is blocked):**
- [ ] CSRF token location (meta tag? cookie? dedicated endpoint?)
- [ ] Internal API endpoints that accept cookies + CSRF
- [ ] Which operations are available (compare with official API)

---

## Linear

**Domains:** `linear.app`

**Known auth cookies:**
| Cookie | HttpOnly | Purpose |
|--------|:--------:|---------|
| Session cookie | Check | Name unknown from prior research |

**Known API endpoints:**
| Endpoint | Auth |
|----------|------|
| `api.linear.app/graphql` (official) | Bearer token (PAT or OAuth) |

**Key detail:** Linear offers self-service personal API keys to all users (Settings > Security & Access). Cookie-based access is unnecessary. Only investigate if admin has blocked API key creation (Enterprise plan only).

**Recommendation:** Use personal API key. Only investigate cookie-based access if API keys are disabled.

**What to validate (only if API key path is blocked):**
- [ ] Session cookie details
- [ ] Whether the GraphQL API accepts session cookies
- [ ] CSRF requirements

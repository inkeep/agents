# SEO/GEO Remediation Verify-Track Status

Last updated: 2026-02-26

## Verify-track outcomes

### Gap #4: Homepage metadata false positive

Decision: Closed with regression guard.

Closure criteria:
1. `/` redirects to `/overview`.
2. `/overview` contains canonical, description, Open Graph, Twitter, and JSON-LD metadata.
3. Verified in `scripts/smoke-seo.ts`.

### Gap #13: SearchAction structured data

Decision: Deferred until a stable, indexable search results URL exists.

Current implementation:
- The docs site has a client-side search dialog.
- The docs site exposes `/api/search` for search data.
- There is no public search results page URL template such as
  `https://docs.inkeep.com/search?q={search_term_string}`.

Closure criteria:
1. Add a stable indexable search results route.
2. Add `WebSite.potentialAction` with `SearchAction` in JSON-LD using that route.
3. Keep this requirement enforced by `scripts/smoke-seo.ts`.

### Gap #18: OG pre-generation

Decision: Closed via dynamic OG route cache hardening plus prewarm script.

Closure criteria:
1. OG response contains `s-maxage` and `stale-while-revalidate`.
2. Post-deploy prewarm is available via `pnpm --dir agents-docs prewarm-og`.

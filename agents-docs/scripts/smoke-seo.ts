export {};

const BASE_URL = (process.env.DOCS_BASE_URL ?? 'https://docs.inkeep.com').replace(/\/$/, '');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function hasMetadataMarker(html: string, markers: string[]) {
  return markers.some((marker) => html.includes(marker));
}

async function main() {
  const homeResponse = await fetch(`${BASE_URL}/`, {
    redirect: 'manual',
  });
  const redirectLocation = homeResponse.headers.get('location');

  assert(
    homeResponse.status === 307 || homeResponse.status === 308,
    `Expected / to redirect with 307/308, got ${homeResponse.status}.`
  );
  assert(
    redirectLocation === '/overview' || redirectLocation === `${BASE_URL}/overview`,
    `Expected / to redirect to /overview, got "${redirectLocation}".`
  );

  const overviewResponse = await fetch(`${BASE_URL}/overview`);
  assert(overviewResponse.ok, `Expected /overview to return 200, got ${overviewResponse.status}.`);

  const html = await overviewResponse.text();
  assert(
    hasMetadataMarker(html, ['<link rel="canonical"', '"rel":"canonical"']),
    'Missing canonical link in /overview HTML.'
  );
  assert(
    hasMetadataMarker(html, ['<meta name="description"', '"name":"description"']),
    'Missing meta description in /overview HTML.'
  );
  assert(
    hasMetadataMarker(html, ['property="og:url"', '"property":"og:url"']),
    'Missing og:url meta tag in /overview HTML.'
  );
  assert(
    html.includes('<script type="application/ld+json"'),
    'Missing JSON-LD script in /overview HTML.'
  );
  assert(
    hasMetadataMarker(html, ['name="twitter:card"', '"name":"twitter:card"']),
    'Missing twitter metadata in /overview HTML.'
  );

  const robotsResponse = await fetch(`${BASE_URL}/robots.txt`);
  assert(robotsResponse.ok, `Expected /robots.txt to return 200, got ${robotsResponse.status}.`);
  const robotsText = await robotsResponse.text();
  assert(
    robotsText.includes(`Sitemap: ${BASE_URL}/sitemap.xml`),
    'Missing sitemap declaration in robots.txt.'
  );
  assert(/User-agent:\s*\*/i.test(robotsText), 'Missing wildcard user-agent in robots.txt.');

  const manifestResponse = await fetch(`${BASE_URL}/manifest.webmanifest`);
  assert(
    manifestResponse.ok,
    `Expected /manifest.webmanifest to return 200, got ${manifestResponse.status}.`
  );

  const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
  assert(sitemapResponse.ok, `Expected /sitemap.xml to return 200, got ${sitemapResponse.status}.`);
  const sitemapXml = await sitemapResponse.text();
  assert(sitemapXml.includes('<lastmod>'), 'Expected sitemap entries to include <lastmod>.');
  const overviewSitemapMatch = sitemapXml.match(
    /<url>\s*<loc>[^<]*\/overview<\/loc>\s*<lastmod>(.*?)<\/lastmod>/s
  );
  assert(
    overviewSitemapMatch?.[1],
    'Missing freshness-aware lastmod entry for /overview in sitemap.'
  );
  assert(
    !Number.isNaN(new Date(overviewSitemapMatch?.[1] ?? '').valueOf()),
    `Invalid lastmod timestamp for /overview in sitemap: "${overviewSitemapMatch?.[1]}".`
  );

  const machineRouteResponse = await fetch(`${BASE_URL}/overview.mdx`);
  assert(
    machineRouteResponse.ok,
    `Expected /overview.mdx to return 200, got ${machineRouteResponse.status}.`
  );
  const machineBody = await machineRouteResponse.text();
  const canonicalLinkHeader = machineRouteResponse.headers.get('link');
  assert(canonicalLinkHeader, 'Missing canonical Link header on /overview.mdx response.');
  assert(
    machineRouteResponse.headers.get('x-llm-canonical'),
    'Missing X-LLM-Canonical header on /overview.mdx response.'
  );
  assert(
    machineRouteResponse.headers.get('x-llm-last-modified'),
    'Missing X-LLM-Last-Modified header on /overview.mdx response.'
  );
  assert(
    canonicalLinkHeader.includes(`${BASE_URL}/overview`) &&
      canonicalLinkHeader.includes('rel="canonical"'),
    `Invalid canonical Link header on /overview.mdx: "${canonicalLinkHeader}".`
  );
  assert(
    hasMetadataMarker(machineBody, ['LLM_METADATA', 'LLM_SECTIONS']),
    'Missing compact LLM metadata header or section map markers in /overview.mdx body.'
  );

  const llmsTxtResponse = await fetch(`${BASE_URL}/llms.txt`);
  assert(llmsTxtResponse.ok, `Expected /llms.txt to return 200, got ${llmsTxtResponse.status}.`);
  const llmsTxtBody = await llmsTxtResponse.text();
  assert(
    hasMetadataMarker(llmsTxtBody, ['LLM_METADATA', 'sections=']),
    'Missing metadata and section summary in /llms.txt.'
  );

  const llmsFullResponse = await fetch(`${BASE_URL}/llms-full.txt`);
  assert(
    llmsFullResponse.ok,
    `Expected /llms-full.txt to return 200, got ${llmsFullResponse.status}.`
  );
  const llmsFullBody = await llmsFullResponse.text();
  assert(
    hasMetadataMarker(llmsFullBody, ['LLM_PAGE_START', 'LLM_METADATA', 'LLM_PAGE_END']),
    'Missing compact LLM page boundaries or metadata blocks in /llms-full.txt.'
  );

  const ogResponse = await fetch(`${BASE_URL}/api/docs-og/overview/image.png`, {
    headers: {
      Accept: 'image/png',
    },
  });
  assert(
    ogResponse.ok,
    `Expected /api/docs-og/overview/image.png to return 200, got ${ogResponse.status}.`
  );
  const cacheControlHeader = ogResponse.headers.get('cache-control') ?? '';
  assert(
    cacheControlHeader.includes('s-maxage=') &&
      cacheControlHeader.includes('stale-while-revalidate='),
    `Missing strong cache directives on OG response: "${cacheControlHeader}".`
  );

  const searchRouteResponse = await fetch(`${BASE_URL}/search?q=seo-smoke`, {
    redirect: 'manual',
  });
  if (searchRouteResponse.ok) {
    assert(
      html.includes('SearchAction'),
      'SearchAction expected in site JSON-LD when an indexable /search route exists.'
    );
  } else {
    console.log('SearchAction deferred: no indexable /search route detected.');
  }

  console.log('SEO smoke checks passed.');
}

void main();

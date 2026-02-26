export {};

const BASE_URL = (process.env.DOCS_BASE_URL ?? 'https://docs.inkeep.com').replace(/\/$/, '');
const CONCURRENCY = Number.parseInt(process.env.OG_PREWARM_CONCURRENCY ?? '8', 10);

function getUrlsFromSitemap(xml: string) {
  const urls: string[] = [];
  const locationPattern = /<loc>([^<]+)<\/loc>/g;

  for (const match of xml.matchAll(locationPattern)) {
    const location = match[1]?.trim();
    if (location) {
      urls.push(location);
    }
  }

  return urls;
}

function toOgImageUrl(pageUrl: string) {
  const pathname = new URL(pageUrl).pathname.replace(/\/$/, '');
  const slug = pathname.replace(/^\//, '');
  if (!slug) {
    return null;
  }

  return `${BASE_URL}/api/docs-og/${slug}/image.png`;
}

async function fetchSitemapUrls() {
  const response = await fetch(`${BASE_URL}/sitemap.xml`, {
    headers: {
      'User-Agent': 'inkeep-og-prewarm/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap.xml (${response.status})`);
  }

  return getUrlsFromSitemap(await response.text());
}

async function main() {
  const sitemapUrls = await fetchSitemapUrls();
  const ogUrls = sitemapUrls.map(toOgImageUrl).filter((value): value is string => Boolean(value));

  let index = 0;
  let successCount = 0;
  let failureCount = 0;

  const workerCount = Math.max(1, Math.min(CONCURRENCY, ogUrls.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (index < ogUrls.length) {
      const currentIndex = index;
      index += 1;
      const target = ogUrls[currentIndex];

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        const response = await fetch(target, {
          headers: {
            Accept: 'image/png',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          successCount += 1;
          console.log(`OK ${response.status} ${target}`);
        } else {
          failureCount += 1;
          console.log(`FAIL ${response.status} ${target}`);
        }
      } catch (error) {
        failureCount += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.log(`FAIL ERR ${target} ${message}`);
      }
    }
  });

  await Promise.all(workers);

  console.log(`\nPrewarmed ${successCount}/${ogUrls.length} OG image routes.`);
  if (failureCount > 0) {
    throw new Error(`${failureCount} OG routes failed to prewarm.`);
  }
}

void main();

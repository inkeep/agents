/**
 * Fetches cloud redirects from the sitemap
 */
export async function fetchCloudRedirects(): Promise<{ source: string; destination: string }[]> {
  try {
    const sitemapUrl = 'https://docs.inkeep.com/cloud/sitemap.json';
    console.log('Fetching cloud redirects from sitemap...');

    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch sitemap: ${response.status}`);
      return [];
    }

    const sitemap = await response.json();
    const cloudRedirects = [];

    for (const item of sitemap) {
      const url = item.url;
      if (url.includes('/cloud/')) {
        const cloudIndex = url.indexOf('/cloud/');
        const source = url.substring(cloudIndex + 7); // +7 to skip '/cloud/'
        const destination = `/cloud/${source}`;

        cloudRedirects.push({
          source: `/${source}`,
          destination: destination,
        });
      }
    }

    console.log(`Generated ${cloudRedirects.length} cloud redirects`);
    return cloudRedirects;
  } catch (error) {
    console.warn(
      'Error fetching cloud redirects:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return [];
  }
}

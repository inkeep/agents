import { readFileSync } from 'node:fs';
import { getTableOfContents } from 'fumadocs-core/content/toc';
import { getSlugs } from 'fumadocs-core/source';
import { printErrors, readFiles, scanURLs, validateFiles } from 'next-validate-link';

async function checkLinks() {
  const docsFiles = await readFiles('content/**/*.{md,mdx}');
  // Shared snippets are imported into many pages, so their links must be checked too.
  const snippetFiles = await readFiles('_snippets/**/*.{md,mdx}');

  // Build valid URLs manually from the slugs
  const scanned = await scanURLs({
    populate: {
      '[[...slug]]': docsFiles.map((file) => {
        return {
          value: getSlugs(file.path.replace(/^content\//, '')),
          hashes: getTableOfContents(file.content).map((item) => item.url.slice(1)),
        };
      }),
    },
  });

  const standardErrors = await validateFiles([...docsFiles, ...snippetFiles], {
    scanned,
    markdown: {
      components: {
        // <Card href="..."> carries its link in an attribute, not in markdown syntax
        Card: { attributes: ['href'] },
      },
    },
  });

  // Check that every internal redirect destination is a real page
  const validPaths = new Set(
    docsFiles.map((file) => `/${getSlugs(file.path.replace(/^content\//, '')).join('/')}`)
  );
  validPaths.add('/');

  const raw = JSON.parse(readFileSync('redirects.json', 'utf8'));
  const redirects: { source: string; destination: string }[] = Array.isArray(raw)
    ? raw
    : (raw.redirects ?? []);

  const brokenRedirects = redirects.filter(({ destination }) => {
    if (!destination.startsWith('/') || /[:*]/.test(destination)) return false;
    return !validPaths.has(destination.split('#')[0].replace(/\/$/, '') || '/');
  });

  for (const { source, destination } of brokenRedirects) {
    console.error(`redirects.json: ${source} -> ${destination} (destination page not found)`);
  }

  if (brokenRedirects.length > 0) process.exitCode = 1;
  printErrors(standardErrors, true);
}

void checkLinks();

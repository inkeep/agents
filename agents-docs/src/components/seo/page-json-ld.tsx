import type {
  BreadcrumbList,
  CollectionPage,
  HowTo,
  ItemList,
  SoftwareApplication,
  TechArticle,
  Thing,
  WebPage,
  WithContext,
} from 'schema-dts';
import { JsonLd } from '@/components/seo/json-ld';
import { BASE_URL } from '@/lib/constants';
import { formatFreshnessDate } from '@/lib/freshness';
import type { TocEntry } from '@/lib/llm-metadata';
import { normalizeTitle } from '@/lib/llm-metadata';
import { resolveSchemaPolicy } from '@/lib/schema-policy';

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface PageJsonLdProps {
  title: string;
  description?: string;
  url: string;
  breadcrumbItems: BreadcrumbItem[];
  tocItems?: readonly TocEntry[];
  datePublished?: string;
  dateModified?: string;
}

const stepHeadingPattern = /^step\s+\d+/i;

function toAbsoluteUrl(url: string) {
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${BASE_URL}${normalizedPath}`;
}

function toAnchorUrl(pageUrl: string, tocUrl: string | undefined) {
  if (!tocUrl) {
    return pageUrl;
  }

  if (tocUrl.startsWith('#')) {
    return `${pageUrl}${tocUrl}`;
  }

  if (tocUrl.includes('#')) {
    return `${pageUrl}${tocUrl.slice(tocUrl.indexOf('#'))}`;
  }

  return `${pageUrl}#${tocUrl}`;
}

function flattenTocItems(tocItems: readonly TocEntry[] = []) {
  const entries: Array<{ title: string; url: string }> = [];

  const walk = (items: readonly TocEntry[] = []) => {
    for (const item of items) {
      const title = normalizeTitle(item.title);
      if (title && item.url) {
        entries.push({
          title,
          url: item.url,
        });
      }

      if (item.children && item.children.length > 0) {
        walk(item.children);
      }
    }
  };

  walk(tocItems);
  return entries;
}

export function PageJsonLd({
  title,
  description,
  url,
  breadcrumbItems,
  tocItems,
  datePublished,
  dateModified,
}: PageJsonLdProps) {
  const pageUrl = toAbsoluteUrl(url);
  const flattenedTocItems = flattenTocItems(tocItems);
  const schemaPolicy = resolveSchemaPolicy({
    url,
    tocTitles: flattenedTocItems.map((item) => item.title),
  });
  const normalizedDatePublished = datePublished ? formatFreshnessDate(datePublished) : undefined;
  const normalizedDateModified = dateModified ? formatFreshnessDate(dateModified) : undefined;
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.url),
    })),
  } satisfies WithContext<BreadcrumbList>;

  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: pageUrl,
    inLanguage: 'en-US',
    datePublished: normalizedDatePublished,
    dateModified: normalizedDateModified,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Inkeep Open Source',
      url: BASE_URL,
    },
  } satisfies WithContext<WebPage>;

  const techArticleLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    inLanguage: 'en-US',
    datePublished: normalizedDatePublished,
    dateModified: normalizedDateModified,
    publisher: {
      '@type': 'Organization',
      name: 'Inkeep',
      url: 'https://inkeep.com',
    },
    isPartOf: {
      '@type': 'WebSite',
      name: 'Inkeep Open Source',
      url: BASE_URL,
    },
  } satisfies WithContext<TechArticle>;

  const collectionPageLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: pageUrl,
    inLanguage: 'en-US',
    datePublished: normalizedDatePublished,
    dateModified: normalizedDateModified,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Inkeep Open Source',
      url: BASE_URL,
    },
  } satisfies WithContext<CollectionPage>;

  const sectionItemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: flattenedTocItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.title,
      item: toAnchorUrl(pageUrl, item.url),
    })),
  } satisfies WithContext<ItemList>;

  const softwareApplicationLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Inkeep Open Source',
    description,
    url: pageUrl,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    datePublished: normalizedDatePublished,
    dateModified: normalizedDateModified,
    publisher: {
      '@type': 'Organization',
      name: 'Inkeep',
      url: 'https://inkeep.com',
    },
  } satisfies WithContext<SoftwareApplication>;

  const jsonLdPayload: WithContext<Thing>[] = [breadcrumbLd, webPageLd];

  switch (schemaPolicy.primarySchema) {
    case 'collectionPage':
      jsonLdPayload.push(collectionPageLd);
      if (flattenedTocItems.length > 0) {
        jsonLdPayload.push(sectionItemListLd);
      }
      break;
    case 'softwareApplication':
      jsonLdPayload.push(softwareApplicationLd);
      break;
    default:
      jsonLdPayload.push(techArticleLd);
      break;
  }

  if (schemaPolicy.includeHowTo) {
    const howToSteps = flattenedTocItems.filter((item) => stepHeadingPattern.test(item.title));
    if (howToSteps.length >= 3) {
      const howToLd = {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: title,
        description,
        url: pageUrl,
        step: howToSteps.map((item) => ({
          '@type': 'HowToStep',
          name: item.title,
          url: toAnchorUrl(pageUrl, item.url),
        })),
      } satisfies WithContext<HowTo>;
      jsonLdPayload.push(howToLd);
    }
  }

  return <JsonLd json={jsonLdPayload} />;
}

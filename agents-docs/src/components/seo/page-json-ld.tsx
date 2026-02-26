import type { BreadcrumbList, TechArticle, WebPage, WithContext } from 'schema-dts';
import { JsonLd } from '@/components/seo/json-ld';

const BASE_URL = 'https://docs.inkeep.com';

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface PageJsonLdProps {
  title: string;
  description?: string;
  url: string;
  breadcrumbItems: BreadcrumbItem[];
  datePublished?: string;
  dateModified?: string;
}

function toAbsoluteUrl(url: string) {
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${BASE_URL}${normalizedPath}`;
}

export function PageJsonLd({
  title,
  description,
  url,
  breadcrumbItems,
  datePublished,
  dateModified,
}: PageJsonLdProps) {
  const pageUrl = toAbsoluteUrl(url);
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
    datePublished,
    dateModified,
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

  return <JsonLd json={[breadcrumbLd, webPageLd, techArticleLd]} />;
}

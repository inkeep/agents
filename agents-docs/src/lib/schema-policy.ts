export type JsonLdPrimarySchema =
  | 'techArticle'
  | 'collectionPage'
  | 'softwareApplication'
  | 'product';

export interface SchemaPolicyMatrixEntry {
  id: string;
  routePatterns: readonly string[];
  primarySchema: JsonLdPrimarySchema;
  requiredFields: readonly string[];
  enablesHowTo: boolean;
  enablesFaqPage: boolean;
  minHowToSteps?: number;
}

export interface SchemaPolicyMatchInput {
  url: string;
  tocTitles?: readonly string[];
}

export interface ResolvedSchemaPolicy {
  ruleId: string;
  routePatterns: readonly string[];
  primarySchema: JsonLdPrimarySchema;
  requiredFields: readonly string[];
  includeHowTo: boolean;
  includeFaqPage: boolean;
}

export const SEO_SCHEMA_POLICY_MATRIX: readonly SchemaPolicyMatrixEntry[] = [
  {
    id: 'overview-software-application',
    routePatterns: ['/overview'],
    primarySchema: 'softwareApplication',
    requiredFields: ['name', 'description', 'url', 'publisher'],
    enablesHowTo: false,
    enablesFaqPage: false,
  },
  {
    id: 'pricing-product',
    routePatterns: ['/pricing'],
    primarySchema: 'product',
    requiredFields: ['name', 'description', 'brand', 'url'],
    enablesHowTo: false,
    enablesFaqPage: false,
  },
  {
    id: 'hub-collection-page',
    routePatterns: ['/api-reference', '/**/overview'],
    primarySchema: 'collectionPage',
    requiredFields: ['name', 'description', 'url', 'itemListElement'],
    enablesHowTo: false,
    enablesFaqPage: false,
  },
  {
    id: 'default-tech-article',
    routePatterns: ['/**'],
    primarySchema: 'techArticle',
    requiredFields: ['headline', 'description', 'url'],
    enablesHowTo: true,
    enablesFaqPage: true,
    minHowToSteps: 3,
  },
];

const stepHeadingPattern = /^step\s+\d+/i;
const faqHeadingPattern = /(faq|frequently asked questions|common issues|troubleshooting)/i;

function normalizeUrl(url: string) {
  const withoutQuery = url.split('?')[0] ?? url;
  const withoutHash = withoutQuery.split('#')[0] ?? withoutQuery;
  const normalized = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
  if (normalized !== '/' && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function matchesRoutePattern(url: string, pattern: string) {
  if (pattern === '/**') {
    return true;
  }

  if (pattern.startsWith('/**/')) {
    const suffix = pattern.slice(3);
    return url.endsWith(suffix);
  }

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    const exact = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return url === exact || url.startsWith(prefix);
  }

  return url === pattern;
}

function countStepHeadings(tocTitles: readonly string[]) {
  return tocTitles.filter((title) => stepHeadingPattern.test(title)).length;
}

function hasFaqSignals(url: string, tocTitles: readonly string[]) {
  const hasPathSignal = url.includes('/faq') || url.includes('/troubleshooting');
  const hasHeadingSignal = tocTitles.some((title) => faqHeadingPattern.test(title));
  return hasPathSignal || hasHeadingSignal;
}

export function resolveSchemaPolicy({
  url,
  tocTitles = [],
}: SchemaPolicyMatchInput): ResolvedSchemaPolicy {
  const normalizedUrl = normalizeUrl(url);
  const matched =
    SEO_SCHEMA_POLICY_MATRIX.find((entry) =>
      entry.routePatterns.some((routePattern) => matchesRoutePattern(normalizedUrl, routePattern))
    ) ?? SEO_SCHEMA_POLICY_MATRIX[SEO_SCHEMA_POLICY_MATRIX.length - 1];

  const stepCount = countStepHeadings(tocTitles);
  const includeHowTo = matched.enablesHowTo && stepCount >= (matched.minHowToSteps ?? 3);
  const includeFaqPage = matched.enablesFaqPage && hasFaqSignals(normalizedUrl, tocTitles);

  return {
    ruleId: matched.id,
    routePatterns: matched.routePatterns,
    primarySchema: matched.primarySchema,
    requiredFields: matched.requiredFields,
    includeHowTo,
    includeFaqPage,
  };
}

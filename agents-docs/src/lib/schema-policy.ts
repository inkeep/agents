export type JsonLdPrimarySchema = 'techArticle' | 'collectionPage' | 'softwareApplication';

export interface SchemaPolicyMatrixEntry {
  id: string;
  routePatterns: readonly string[];
  primarySchema: JsonLdPrimarySchema;
  requiredFields: readonly string[];
  enablesHowTo: boolean;
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
}

export const SEO_SCHEMA_POLICY_MATRIX: readonly SchemaPolicyMatrixEntry[] = [
  {
    id: 'overview-software-application',
    routePatterns: ['/overview'],
    primarySchema: 'softwareApplication',
    requiredFields: ['name', 'description', 'url', 'publisher'],
    enablesHowTo: false,
  },
  {
    id: 'hub-collection-page',
    routePatterns: ['/api-reference', '/**/overview'],
    primarySchema: 'collectionPage',
    requiredFields: ['name', 'description', 'url', 'itemListElement'],
    enablesHowTo: false,
  },
  {
    id: 'default-tech-article',
    routePatterns: ['/**'],
    primarySchema: 'techArticle',
    requiredFields: ['headline', 'description', 'url'],
    enablesHowTo: true,
    minHowToSteps: 3,
  },
];

const stepHeadingPattern = /^step\s+\d+/i;

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
    return url === exact || url.startsWith(`${exact}/`);
  }

  return url === pattern;
}

function countStepHeadings(tocTitles: readonly string[]) {
  return tocTitles.filter((title) => stepHeadingPattern.test(title)).length;
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

  return {
    ruleId: matched.id,
    routePatterns: matched.routePatterns,
    primarySchema: matched.primarySchema,
    requiredFields: matched.requiredFields,
    includeHowTo,
  };
}

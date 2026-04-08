import * as jmespath from 'jmespath';
import { ToolChainResolutionError } from '../artifacts/ArtifactParser';

/**
 * Strip internal fields (prefixed with _) from a tool result object.
 * Removes _structureHints, _toolCallId, etc. that are added for LLM context
 * but should not appear in traces, stored results, or downstream data.
 */
export function clearSelectorCache(): void {
  selectorCache.clear();
}

export function stripInternalFields<T>(data: T): T {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith('_'))) as T;
  }
  return data;
}

const selectorCache = new Map<string, string>();
const SELECTOR_CACHE_MAX = 1000;
const MAX_EXPRESSION_LENGTH = 1000;

const DANGEROUS_PATTERNS: RegExp[] = [
  /\$\{.*\}/,
  /eval\s*\(/,
  /function\s*\(/,
  /constructor/,
  /prototype/,
  /__proto__/,
];

/**
 * Sanitize JMESPath selector to fix common LLM syntax issues.
 * Extracted from ArtifactService for reuse in $select filtering.
 */
export function sanitizeJMESPathSelector(selector: string): string {
  const cached = selectorCache.get(selector);
  if (cached !== undefined) {
    return cached;
  }

  let sanitized = selector.replace(/=="([^"]*)"/g, "=='$1'");

  sanitized = sanitized.replace(
    /\[\?(\w+)\s*~\s*contains\(@,\s*"([^"]*)"\)\]/g,
    '[?contains($1, `$2`)]'
  );

  sanitized = sanitized.replace(
    /\[\?(\w+)\s*~\s*contains\(@,\s*'([^']*)'\)\]/g,
    '[?contains($1, `$2`)]'
  );

  sanitized = sanitized.replace(/\s*~\s*/g, ' ');

  if (selectorCache.size < SELECTOR_CACHE_MAX) {
    selectorCache.set(selector, sanitized);
  }

  return sanitized;
}

function validateSelector(expression: string, toolCallId: string, originalSelector: string): void {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new ToolChainResolutionError(
      toolCallId,
      `$select expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters. Expression: ${originalSelector}`
    );
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(expression)) {
      throw new ToolChainResolutionError(
        toolCallId,
        `$select expression contains dangerous pattern. Expression: ${originalSelector}`
      );
    }
  }
}

function summarizeShape(data: unknown, maxDepth = 3, currentDepth = 0): string {
  if (data === null || data === undefined) return 'null';
  if (typeof data === 'string') return `string(len=${data.length})`;
  if (typeof data === 'number' || typeof data === 'boolean') return String(typeof data);
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    if (currentDepth >= maxDepth) return `array(len=${data.length})`;
    return `[${summarizeShape(data[0], maxDepth, currentDepth + 1)}](len=${data.length})`;
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>).filter((k) => !k.startsWith('_'));
    if (keys.length === 0) return '{}';
    if (currentDepth >= maxDepth)
      return `{${keys.slice(0, 10).join(', ')}${keys.length > 10 ? ', ...' : ''}}`;
    const entries = keys
      .slice(0, 10)
      .map(
        (k) =>
          `${k}: ${summarizeShape((data as Record<string, unknown>)[k], maxDepth, currentDepth + 1)}`
      );
    return `{${entries.join(', ')}${keys.length > 10 ? ', ...' : ''}}`;
  }
  return typeof data;
}

/**
 * Apply a JMESPath $select filter to resolved tool/artifact data.
 *
 * - Auto-strips `result.` prefix (matches _structureHints selector format)
 * - Sanitizes common LLM JMESPath errors
 * - Validates for security (injection patterns, length)
 * - Returns filtered data or null if selector matches nothing
 * - Throws ToolChainResolutionError on invalid expressions
 */
export function applySelector(data: unknown, selector: string, toolCallId: string): unknown {
  let expression = selector.trim();

  if (expression.startsWith('result.')) {
    expression = expression.slice('result.'.length);
  }

  expression = sanitizeJMESPathSelector(expression);

  validateSelector(expression, toolCallId, selector);

  try {
    const result = jmespath.search(data, expression);
    if (result === null || result === undefined) {
      const dataPreview = summarizeShape(data);
      throw new ToolChainResolutionError(
        toolCallId,
        `$select matched nothing. The expression "${selector}" did not match any data in the tool result. Available data shape: ${dataPreview}. Check _structureHints and try a different selector.`
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ToolChainResolutionError) {
      throw error;
    }
    throw new ToolChainResolutionError(
      toolCallId,
      `$select filter failed: ${error instanceof Error ? error.message : String(error)}. Expression: ${selector}`
    );
  }
}

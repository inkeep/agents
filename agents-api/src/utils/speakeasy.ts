/**
 * Shared route configurations and helpers
 */

/**
 * Speakeasy pagination input configuration
 */
type SpeakeasyPaginationInput = {
  name: string;
  in: 'parameters' | 'requestBody';
  type: 'page' | 'limit' | 'offset' | 'cursor';
};

/**
 * Speakeasy pagination output configuration
 * Uses JSONPath expressions to locate pagination values in the response
 */
type SpeakeasyPaginationOutputs = {
  numPages?: string;
  nextCursor?: string;
  results?: string;
};

/**
 * Speakeasy pagination extension type
 */
type SpeakeasyPaginationExtension = {
  'x-speakeasy-pagination': {
    type: 'offsetLimit' | 'cursor';
    inputs: SpeakeasyPaginationInput[];
    outputs: SpeakeasyPaginationOutputs;
  };
};

/**
 * Standard pagination response shape that all paginated endpoints should return.
 * This ensures consistency with the JSONPath '$.pagination.pages' in the Speakeasy extension.
 */
export type StandardPaginationResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

/**
 * Creates a Speakeasy pagination extension configuration.
 * This factory function allows for different pagination strategies while maintaining type safety.
 *
 * @example
 * ```ts
 * // Offset-limit pagination (default)
 * const pagination = createSpeakeasyPagination('offsetLimit');
 *
 * // Cursor-based pagination (future use)
 * const cursorPagination = createSpeakeasyPagination('cursor', {
 *   inputs: [
 *     { name: 'cursor', in: 'parameters', type: 'cursor' },
 *     { name: 'limit', in: 'parameters', type: 'limit' },
 *   ],
 *   outputs: { nextCursor: '$.pagination.nextCursor' },
 * });
 * ```
 */
export function createSpeakeasyPagination(
  type: 'offsetLimit',
  config?: Partial<{
    inputs: SpeakeasyPaginationInput[];
    outputs: SpeakeasyPaginationOutputs;
  }>
): SpeakeasyPaginationExtension;
export function createSpeakeasyPagination(
  type: 'cursor',
  config: {
    inputs: SpeakeasyPaginationInput[];
    outputs: SpeakeasyPaginationOutputs;
  }
): SpeakeasyPaginationExtension;
export function createSpeakeasyPagination(
  type: 'offsetLimit' | 'cursor',
  config?: Partial<{
    inputs: SpeakeasyPaginationInput[];
    outputs: SpeakeasyPaginationOutputs;
  }>
): SpeakeasyPaginationExtension {
  if (type === 'offsetLimit') {
    return {
      'x-speakeasy-pagination': {
        type: 'offsetLimit' as const,
        inputs: config?.inputs ?? [
          { name: 'page', in: 'parameters' as const, type: 'page' as const },
          { name: 'limit', in: 'parameters' as const, type: 'limit' as const },
        ],
        outputs: config?.outputs ?? {
          numPages: '$.pagination.pages',
        },
      },
    };
  }

  // For cursor type, config is required (enforced by overload signature)
  return {
    'x-speakeasy-pagination': {
      type: 'cursor' as const,
      inputs: config?.inputs ?? [],
      outputs: config?.outputs ?? {},
    },
  };
}

/**
 * Speakeasy pagination extension for offset-limit pagination.
 * Use this in createRoute() calls for list endpoints that support pagination.
 *
 * IMPORTANT: Endpoints using this extension MUST return responses matching
 * the StandardPaginationResponse<T> shape with data from a *Paginated() function
 * (e.g., listAgentsPaginated, listProjectsPaginated) to ensure the JSONPath
 * '$.pagination.pages' correctly resolves.
 *
 * @example
 * ```ts
 * createRoute({
 *   method: 'get',
 *   path: '/',
 *   // ... other config
 *   ...speakeasyOffsetLimitPagination,
 * })
 * ```
 */
export const speakeasyOffsetLimitPagination = createSpeakeasyPagination('offsetLimit');

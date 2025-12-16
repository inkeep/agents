/**
 * Shared route configurations and helpers
 */

/**
 * Speakeasy pagination extension for offset-limit pagination.
 * Use this in createRoute() calls for list endpoints that support pagination.
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
export const speakeasyOffsetLimitPagination = {
  'x-speakeasy-pagination': {
    type: 'offsetLimit',
    inputs: [
      { name: 'page', in: 'parameters', type: 'page' },
      { name: 'limit', in: 'parameters', type: 'limit' },
    ],
    outputs: {
      numPages: '$.pagination.pages',
    },
  },
} as const;

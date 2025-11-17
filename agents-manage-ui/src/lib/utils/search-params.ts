/**
 * Utility functions for working with Next.js searchParams
 */

/**
 * Safely extract the ref parameter from searchParams
 * Ensures it's a string (not string[]) and handles undefined
 *
 * @param searchParams - The searchParams object from Next.js page props
 * @returns The ref as a string, or undefined if not present or invalid
 */
export function getRefFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): string | undefined {
  const ref = searchParams.ref;

  // If ref is not present, return undefined
  if (ref === undefined) {
    return undefined;
  }

  // If ref is an array, take the first element
  if (Array.isArray(ref)) {
    return ref[0];
  }

  // Otherwise return the string value
  return ref;
}

/**
 * Extract query parameters for API requests from searchParams
 * Currently only handles the 'ref' parameter
 *
 * @param searchParams - The searchParams object from Next.js page props
 * @returns An object suitable for passing to API functions as queryParams
 */
export function getValidSearchParams(searchParams: Record<string, string | string[] | undefined>): {
  ref?: string;
} {
  return {
    ref: getRefFromSearchParams(searchParams),
  };
}

/**
 * Extract query parameters for API requests from searchParams Promise
 * Handles awaiting the Promise and extracting valid params
 *
 * @param searchParams - The searchParams Promise from Next.js page props
 * @returns An object suitable for passing to API functions as queryParams
 */
export async function getValidSearchParamsAsync(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<{ ref?: string }> {
  const params = await searchParams;
  return getValidSearchParams(params);
}

/**
 * Normalizes a base URL by removing trailing slashes and validating format
 * @param url The URL to normalize
 * @returns The normalized URL
 * @throws Error if URL is invalid
 */
export function normalizeBaseUrl(url: string): string {
  // Trim whitespace
  const trimmedUrl = url.trim();

  // Basic URL validation - must start with http:// or https://
  if (!trimmedUrl.match(/^https?:\/\//i)) {
    throw new Error(`Invalid URL format: ${url}. Must start with http:// or https://`);
  }

  // Remove trailing slash(es)
  return trimmedUrl.replace(/\/+$/, '');
}

/**
 * Constructs a graph view URL for the management UI
 * @param manageUiUrl The base management UI URL
 * @param tenantId The tenant ID
 * @param projectId The project ID
 * @param graphId The graph ID
 * @returns The complete graph view URL
 */
export function buildGraphViewUrl(
  manageUiUrl: string | undefined,
  tenantId: string,
  projectId: string,
  graphId: string
): string {
  const baseUrl = normalizeBaseUrl(manageUiUrl || 'http://localhost:3000');
  return `${baseUrl}/${tenantId}/projects/${projectId}/graphs/${graphId}`;
}

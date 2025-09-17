// Client-side utility for building MCP-related URLs
// This file does NOT have 'use server' so functions can be synchronous

// Default configuration (same as in api/tools.ts)

/**
 * Get OAuth login URL for an MCP tool that requires authentication
 * This returns the URL that should be used for redirect on the client side
 */
export function getOAuthLoginUrl({
  INKEEP_AGENTS_MANAGE_API_URL,
  tenantId,
  projectId,
  id,
}: {
  INKEEP_AGENTS_MANAGE_API_URL: string;
  tenantId: string;
  projectId: string;
  id: string;
}): string {
  // Validate input parameters
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid tenantId: must be a non-empty string');
  }

  if (!id || typeof id !== 'string') {
    throw new Error('Invalid tool id: must be a non-empty string');
  }

  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Invalid projectId: must be a non-empty string');
  }

  // Validate format - only allow alphanumeric, hyphens, and underscores
  const validFormat = /^[a-zA-Z0-9-_]+$/;

  if (!validFormat.test(tenantId)) {
    throw new Error(
      'Invalid tenantId format: only alphanumeric characters, hyphens, and underscores allowed'
    );
  }

  if (!validFormat.test(id)) {
    throw new Error(
      'Invalid tool id format: only alphanumeric characters, hyphens, and underscores allowed'
    );
  }

  if (!validFormat.test(projectId)) {
    throw new Error(
      'Invalid projectId format: only alphanumeric characters, hyphens, and underscores allowed'
    );
  }

  // Build URL with proper encoding
  const url = `${INKEEP_AGENTS_MANAGE_API_URL}/tenants/${encodeURIComponent(tenantId)}/crud/projects/${encodeURIComponent(projectId)}/tools/${encodeURIComponent(id)}/oauth-login`;

  // Verify the final URL starts with our expected base
  if (!url.startsWith(INKEEP_AGENTS_MANAGE_API_URL)) {
    throw new Error('Invalid OAuth URL generated');
  }

  return url;
}

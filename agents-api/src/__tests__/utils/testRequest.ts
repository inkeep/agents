import { env } from '../../env';
import app from '../../index';

interface TestRequestOptions extends RequestInit {
  expectError?: boolean;
  customHeaders?: Record<string, string>;
}

/**
 * Detect if a URL is for the run domain (requires run API auth)
 */
function isRunRoute(url: string): boolean {
  return (
    url.startsWith('/run/') ||
    url.includes('/v1/chat') ||
    url.includes('/v1/mcp') ||
    url.includes('/api/chat')
  );
}

// Helper function to make requests with JSON headers
// Automatically handles auth for both manage and run routes
export const makeRequest = async (url: string, options: TestRequestOptions = {}) => {
  const { expectError = false, customHeaders = {}, ...requestOptions } = options;

  // Build auth headers based on route type
  const authHeaders: Record<string, string> = {};

  if (isRunRoute(url)) {
    // Run routes need the run API bypass secret and context headers
    authHeaders.Authorization = `Bearer ${env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || 'test-bypass-secret'}`;
    authHeaders['x-inkeep-tenant-id'] = 'test-tenant';
    authHeaders['x-inkeep-project-id'] = 'default';
    authHeaders['x-inkeep-agent-id'] = 'test-agent';
  } else {
    // Manage routes use the manage API bypass secret
    // Use hardcoded fallback for integration tests where env may not be loaded in time
    const bypassSecret =
      env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET ||
      process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET ||
      'integration-test-bypass-secret';
    authHeaders.Authorization = `Bearer ${bypassSecret}`;
  }

  const response = await app.request(url, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...customHeaders,
      ...requestOptions.headers,
    },
  });

  // Only log truly unexpected server errors (500+) when expectError is false
  // Client errors (400-499) are often legitimate test cases checking for validation/not found/etc
  if (!expectError && response.status >= 500) {
    try {
      const errorBody = await response.clone().json();
      console.error(`Unexpected server error (${response.status}):`, errorBody);
    } catch {
      // If JSON parsing fails, just log the status
      console.error(`Unexpected server error (${response.status})`);
    }
  }

  return response;
};

// Helper function to make requests with JSON headers and test authentication
// Uses the bypass secret configured in vitest.config.ts (INKEEP_AGENTS_RUN_API_BYPASS_SECRET)
export const makeRunRequest = async (url: string, options: RequestInit = {}) => {
  return app.request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || 'test-bypass-secret'}`,
      'x-inkeep-tenant-id': 'test-tenant',
      'x-inkeep-project-id': 'default',
      'x-inkeep-agent-id': 'test-agent',
      ...options.headers,
    },
  });
};

// Helper function to make requests with custom execution context
// Uses the bypass secret configured in vitest.config.ts (INKEEP_AGENTS_RUN_API_BYPASS_SECRET)
export const makeRunRequestWithContext = async (
  url: string,
  context: {
    tenantId?: string;
    projectId?: string;
    agentId?: string;
    subAgentId?: string;
  },
  options: RequestInit = {}
) => {
  return app.request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || 'test-bypass-secret'}`,
      'x-inkeep-tenant-id': context.tenantId || 'test-tenant',
      'x-inkeep-project-id': context.projectId || 'test-project',
      'x-inkeep-agent-id': context.agentId || 'test-agent',
      ...(context.subAgentId && { 'x-inkeep-sub-agent-id': context.subAgentId }),
      ...options.headers,
    },
  });
};

import { env } from '../../env';
import app from '../../index';

interface TestRequestOptions extends RequestInit {
  expectError?: boolean;
  customHeaders?: Record<string, string>;
}

// Helper function to make requests with JSON headers
export const makeRequest = async (url: string, options: TestRequestOptions = {}) => {
  const { expectError = false, customHeaders = {}, ...requestOptions } = options;

  const response = await app.request(url, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      // Include bypass secret if configured (for authentication in tests)
      ...(env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET && {
        Authorization: `Bearer ${env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET}`,
      }),
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
export const makeRunRequest = async (url: string, options: RequestInit = {}) => {
  return app.request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-api-key',
      'x-inkeep-tenant-id': 'test-tenant',
      'x-inkeep-project-id': 'default',
      'x-inkeep-agent-id': 'test-agent',
      'x-test-bypass-auth': 'true',
      ...options.headers,
    },
  });
};

// Helper function to make requests with custom execution context
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
      Authorization: 'Bearer test-api-key',
      'x-inkeep-tenant-id': context.tenantId || 'test-tenant',
      'x-inkeep-project-id': context.projectId || 'test-project',
      'x-inkeep-agent-id': context.agentId || 'test-agent',
      'x-test-bypass-auth': 'true',
      ...(context.subAgentId && { 'x-inkeep-sub-agent-id': context.subAgentId }),
      ...options.headers,
    },
  });
};


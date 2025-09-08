import app from '../../index';

// Helper function to make requests with JSON headers and test authentication
export const makeRequest = async (url: string, options: RequestInit = {}) => {
  return app.request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-api-key',
      'x-inkeep-tenant-id': 'test-tenant',
      'x-inkeep-project-id': 'default',
      'x-inkeep-graph-id': 'test-graph',
      'x-test-bypass-auth': 'true',
      ...options.headers,
    },
  });
};

// Helper function to make requests with custom execution context
export const makeRequestWithContext = async (
  url: string,
  context: {
    tenantId?: string;
    projectId?: string;
    graphId?: string;
    agentId?: string;
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
      'x-inkeep-graph-id': context.graphId || 'test-graph',
      'x-test-bypass-auth': 'true',
      ...(context.agentId && { 'x-inkeep-agent-id': context.agentId }),
      ...options.headers,
    },
  });
};

import type { CredentialStoreType } from '@inkeep/agents-core';
import { generateId } from '@inkeep/agents-core';

/**
 * Creates test data for a tool (MCP-based).
 *
 * @param id - The tool ID
 * @param suffix - Optional suffix to append to name/description
 * @returns Test tool data object
 *
 * @example
 * ```typescript
 * const tool = createTestToolData('tool-1', ' Main');
 * ```
 */
export function createTestToolData(id: string, suffix = '') {
  // Remove all non-numeric characters from suffix for URL port
  const urlSuffix = suffix.replace(/\D/g, '') || '1';
  return {
    id,
    name: `Test Tool${suffix}`,
    config: {
      type: 'mcp' as const,
      mcp: {
        server: {
          url: `http://localhost:300${urlSuffix}`,
        },
      },
    },
    status: 'unknown' as const,
    capabilities: { tools: true },
    lastHealthCheck: new Date().toISOString(),
    availableTools: [
      {
        name: `testTool${suffix}`,
        description: `Test tool function${suffix}`,
      },
    ],
  };
}

/**
 * Creates test data for a data component.
 *
 * @param id - The data component ID
 * @param suffix - Optional suffix to append to name/description
 * @returns Test data component data object
 *
 * @example
 * ```typescript
 * const dataComponent = createTestDataComponentData('dc-1', ' Main');
 * ```
 */
export function createTestDataComponentData(id: string, suffix = '') {
  return {
    id,
    name: `Test DataComponent${suffix}`,
    description: `Test data component description${suffix}`,
    props: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' },
          description: `Test items array${suffix}`,
        },
        title: {
          type: 'string',
          description: `Test title${suffix}`,
        },
      },
      required: ['items'],
    },
  };
}

/**
 * Creates test data for a context configuration.
 *
 * @param id - The context config ID
 * @param agentId - The agent ID this context config belongs to
 * @param suffix - Optional suffix to append to name/description
 * @returns Test context config data object
 *
 * @example
 * ```typescript
 * const contextConfig = createTestContextConfigData('cc-1', 'agent-1', ' Main');
 * ```
 */
export function createTestContextConfigData(id: string, agentId: string, suffix = '') {
  return {
    id,
    agentId,
    name: `Context Config${suffix}`,
    description: `Test context configuration${suffix}`,
    contextSources: [
      {
        type: 'static' as const,
        content: `Static context content${suffix}`,
      },
    ],
  };
}

/**
 * Creates test data for a context configuration with full schema.
 * This is an extended version used in integration tests.
 *
 * @param options - Configuration options
 * @param options.id - Optional custom ID (defaults to generated ID)
 * @param options.suffix - Optional suffix to append to name/description
 * @param options.tenantId - Optional tenant ID
 * @param options.projectId - Optional project ID
 * @param options.agentId - Optional agent ID
 * @returns Test context config data object with full schema
 *
 * @example
 * ```typescript
 * const contextConfig = createTestContextConfigDataFull({
 *   suffix: ' Main',
 *   agentId: 'agent-1'
 * });
 * ```
 */
export function createTestContextConfigDataFull({
  id,
  suffix = '',
}: {
  id?: string;
  suffix?: string;
  tenantId?: string;
  projectId?: string;
  agentId?: string;
} = {}) {
  const configId =
    id || `test-context-config${suffix.toLowerCase().replace(/\s+/g, '-')}-${generateId(6)}`;
  return {
    id: configId,
    // Note: tenantId, projectId, agentId, name, and description are NOT part of context config schema
    // Context configs only have: id, headersSchema, contextVariables
    headersSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User identifier' },
        sessionToken: { type: 'string', description: 'Session token' },
        ...(suffix
          ? {
              [`param${suffix.replace(/\s+/g, '')}`]: {
                type: 'string',
                description: `Test parameter${suffix}`,
              },
            }
          : {}),
      },
      required: ['userId'],
    },
    contextVariables: {
      [`userProfile${suffix.replace(/\s+/g, '')}`]: {
        id: `user-profile${suffix.replace(/\s+/g, '-')}`,
        name: `User Profile${suffix}`,
        trigger: 'initialization',
        fetchConfig: {
          url: `https://api.example.com/users/{{headers.userId}}${suffix.replace(/\s+/g, '-')}`,
          method: 'GET',
          headers: {
            Authorization: 'Bearer {{headers.sessionToken}}',
          },
        },
        defaultValue: { name: `Default User${suffix}` },
      },
    },
  };
}

/**
 * Creates test data for an artifact component.
 *
 * @param id - The artifact component ID
 * @param suffix - Optional suffix to append to name/description
 * @returns Test artifact component data object
 *
 * @example
 * ```typescript
 * const artifactComponent = createTestArtifactComponentData('ac-1', ' Main');
 * ```
 */
export function createTestArtifactComponentData(id: string, suffix = '') {
  return {
    id,
    name: `Test ArtifactComponent${suffix}`,
    description: `Test artifact component description${suffix}`,
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', inPreview: true },
        subtitle: { type: 'string', inPreview: true },
        ...(suffix ? { [`field${suffix}`]: { type: 'string', inPreview: true } } : {}),
        content: { type: 'string', inPreview: false },
        metadata: {
          type: 'object',
          inPreview: false,
          properties: {
            author: { type: 'string' },
            created: { type: 'string' },
          },
        },
      },
    },
  };
}

/**
 * Creates test data for a project.
 *
 * @param options - Configuration options
 * @param options.id - Optional custom ID
 * @param options.suffix - Optional suffix to append to name/description
 * @returns Test project data object
 *
 * @example
 * ```typescript
 * const project = createTestProjectData({ suffix: ' Main' });
 * ```
 */
export function createTestProjectData({ id, suffix = '' }: { id?: string; suffix?: string } = {}) {
  const projectId =
    id || `test-project${suffix.toLowerCase().replace(/\s+/g, '-')}-${generateId(6)}`;
  return {
    id: projectId,
    name: `Test Project${suffix}`,
    description: `Test Description${suffix}`,
    models: {
      base: {
        provider: 'openai',
        model: 'gpt-4',
      },
    },
  };
}

/**
 * Creates test data for a credential reference.
 *
 * @param options - Configuration options
 * @param options.suffix - Optional suffix to append to name/description
 * @param options.type - The credential store type
 * @returns Test credential data object
 *
 * @example
 * ```typescript
 * const credential = createTestCredentialData({ suffix: ' Main' });
 * ```
 */
export function createTestCredentialData({
  suffix = '',
  type = 'nango',
}: {
  suffix?: string;
  type?: (typeof CredentialStoreType)[keyof typeof CredentialStoreType];
} = {}) {
  const timestamp = Date.now();
  const cleanSuffix = suffix.toLowerCase().replace(/\s+/g, '-');
  return {
    id: `test-credential${cleanSuffix}-${timestamp}`,
    type,
    name: `Test Credential${suffix}`,
    description: `Test credential description${suffix}`,
    provider: 'google',
    connectionId: `conn-${generateId()}`,
    integrationId: `int-${generateId()}`,
  };
}

/**
 * Creates test data for an agent.
 *
 * @param options - Configuration options
 * @param options.id - Optional custom ID
 * @param options.defaultSubAgentId - Optional default sub-agent ID
 * @returns Test agent data object
 *
 * @example
 * ```typescript
 * const agent = createTestAgentData({ defaultSubAgentId: 'agent-1' });
 * ```
 */
export function createTestAgentData({
  id,
  defaultSubAgentId = null,
}: {
  id?: string;
  defaultSubAgentId?: string | null;
} = {}) {
  const agentId = id || generateId();
  return {
    id: agentId,
    name: `Test Agent ${agentId}`,
    description: 'Test agent description',
    defaultSubAgentId,
  };
}

/**
 * Creates test data for an agent-tool relation.
 *
 * @param options - Configuration options
 * @param options.agentId - The agent ID
 * @param options.subAgentId - The sub-agent ID
 * @param options.toolId - The tool ID
 * @param options.toolSelection - Optional array of tool names to enable
 * @param options.headers - Optional headers for the tool
 * @returns Test agent-tool relation data object
 *
 * @example
 * ```typescript
 * const relation = createTestAgentToolRelationData({
 *   agentId: 'agent-1',
 *   subAgentId: 'sub-agent-1',
 *   toolId: 'tool-1'
 * });
 * ```
 */
export function createTestAgentToolRelationData({
  id,
  agentId,
  subAgentId,
  toolId,
  toolSelection = null,
  headers = null,
}: {
  id?: string;
  agentId: string;
  subAgentId: string;
  toolId: string;
  toolSelection?: string[] | null;
  headers?: Record<string, string> | null;
}) {
  return {
    id: id || generateId(),
    agentId,
    subAgentId,
    toolId,
    toolSelection,
    headers,
  };
}

/**
 * Creates test data for an agent-data component relation.
 *
 * @param options - Configuration options
 * @param options.agentId - The agent ID
 * @param options.subAgentId - The sub-agent ID
 * @param options.dataComponentId - The data component ID
 * @returns Test agent-data component relation data object
 *
 * @example
 * ```typescript
 * const relation = createTestAgentDataComponentData({
 *   agentId: 'agent-1',
 *   subAgentId: 'sub-agent-1',
 *   dataComponentId: 'dc-1'
 * });
 * ```
 */
export function createTestAgentDataComponentData({
  agentId = 'default',
  subAgentId,
  dataComponentId,
}: {
  agentId?: string;
  subAgentId: string;
  dataComponentId: string;
}) {
  return {
    id: `${subAgentId}-${dataComponentId}`,
    agentId,
    subAgentId,
    dataComponentId,
  };
}

/**
 * Creates test data for an agent-artifact component relation.
 *
 * @param options - Configuration options
 * @param options.agentId - The agent ID
 * @param options.subAgentId - The sub-agent ID
 * @param options.artifactComponentId - The artifact component ID
 * @returns Test agent-artifact component relation data object
 *
 * @example
 * ```typescript
 * const relation = createTestAgentArtifactComponentData({
 *   agentId: 'agent-1',
 *   subAgentId: 'sub-agent-1',
 *   artifactComponentId: 'ac-1'
 * });
 * ```
 */
export function createTestAgentArtifactComponentData({
  agentId = 'default',
  subAgentId,
  artifactComponentId,
}: {
  agentId?: string;
  subAgentId: string;
  artifactComponentId: string;
}) {
  return {
    id: `${subAgentId}-${artifactComponentId}`,
    agentId,
    subAgentId,
    artifactComponentId,
  };
}

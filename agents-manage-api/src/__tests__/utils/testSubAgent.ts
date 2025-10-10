import { nanoid } from 'nanoid';

/**
 * Creates test data for an internal sub-agent.
 *
 * @param options - Configuration options for the test sub-agent
 * @param options.id - Optional custom ID (defaults to nanoid())
 * @param options.suffix - Optional suffix to append to name/description/prompt
 * @param options.graphId - Optional graph ID
 * @param options.tenantId - Optional tenant ID
 * @param options.projectId - Optional project ID
 * @param options.tools - Optional array of tool IDs
 * @param options.canUse - Optional array of tool usage configurations
 * @param options.canDelegateTo - Optional array of sub-agent IDs for delegation
 * @param options.canTransferTo - Optional array of sub-agent IDs for transfer
 * @param options.dataComponents - Optional array of data component IDs
 * @param options.artifactComponents - Optional array of artifact component IDs
 * @returns Test sub-agent data object
 *
 * @example
 * ```typescript
 * const subAgent = createTestSubAgentData({ suffix: ' QA', graphId: 'my-graph' });
 * ```
 */
export function createTestSubAgentData({
  id,
  suffix = '',
  agentId,
  tenantId,
  projectId,
  tools = [],
  canUse = [],
  canDelegateTo = [],
  canTransferTo = [],
  dataComponents = [],
  artifactComponents = [],
}: {
  id?: string;
  suffix?: string;
  agentId?: string;
  tenantId?: string;
  projectId?: string;
  tools?: string[];
  canUse?: Array<{
    toolId: string;
    toolSelection?: string[] | null;
    headers?: Record<string, string> | null;
  }>;
  canDelegateTo?: string[];
  canTransferTo?: string[];
  dataComponents?: string[];
  artifactComponents?: string[];
} = {}) {
  const subAgentId = id || `test-agent${suffix.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`;

  const baseData: any = {
    id: subAgentId,
    name: `Test Agent${suffix}`,
    description: `Test agent description${suffix}`,
    prompt: `You are a helpful assistant${suffix}.`,
    type: 'internal' as const,
    canUse: canUse, // Required field - always include
  };

  // Only add optional fields if they're provided
  if (agentId !== undefined) baseData.agentId = agentId;
  if (tenantId !== undefined) baseData.tenantId = tenantId;
  if (projectId !== undefined) baseData.projectId = projectId;
  if (tools.length > 0 || canUse.length === 0) baseData.tools = tools;
  if (canDelegateTo.length > 0) baseData.canDelegateTo = canDelegateTo;
  if (canTransferTo.length > 0) baseData.canTransferTo = canTransferTo;
  if (dataComponents.length > 0) baseData.dataComponents = dataComponents;
  if (artifactComponents.length > 0) baseData.artifactComponents = artifactComponents;

  return baseData;
}

/**
 * Creates test data for an external sub-agent.
 *
 * @param options - Configuration options for the test external sub-agent
 * @param options.id - Custom ID for the external agent
 * @param options.suffix - Optional suffix to append to name/description
 * @param options.tenantId - Optional tenant ID
 * @param options.projectId - Optional project ID
 * @param options.agentId - Optional agent ID
 * @param options.baseUrl - Base URL for the external agent (defaults to example URL)
 * @param options.headers - Optional headers for the external agent
 * @param options.credentialReferenceId - Optional credential reference ID
 * @returns Test external sub-agent data object
 *
 * @example
 * ```typescript
 * const externalAgent = createTestExternalAgentData({
 *   id: 'ext-agent-1',
 *   suffix: ' External',
 *   agentId: 'my-agent',
 *   baseUrl: 'https://api.example.com'
 * });
 * ```
 */
export function createTestExternalAgentData({
  id,
  suffix = '',
  tenantId,
  projectId,
  agentId,
  baseUrl,
  headers,
  credentialReferenceId,
}: {
  id?: string;
  suffix?: string;
  tenantId?: string;
  projectId?: string;
  agentId?: string;
  baseUrl?: string;
  headers?: Record<string, string> | null;
  credentialReferenceId?: string | null;
} = {}) {
  const subAgentId =
    id || `test-external-agent${suffix.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`;

  const baseData: any = {
    id: subAgentId,
    name: `Test External Agent${suffix}`,
    description: `Test external agent description${suffix}`,
    baseUrl:
      baseUrl ||
      `https://api.example.com/external-agent${suffix.toLowerCase().replace(/\s+/g, '-')}`,
    type: 'external' as const,
  };

  // Only add optional fields if they're provided
  if (tenantId !== undefined) baseData.tenantId = tenantId;
  if (projectId !== undefined) baseData.projectId = projectId;
  if (agentId !== undefined) baseData.agentId = agentId;
  if (headers !== undefined) baseData.headers = headers;
  if (credentialReferenceId !== undefined) baseData.credentialReferenceId = credentialReferenceId;

  return baseData;
}

/**
 * Creates test data for an agent relation.
 *
 * @param options - Configuration options for the agent relation
 * @param options.graphId - The graph ID for the relation
 * @param options.sourceSubAgentId - The source sub-agent ID
 * @param options.targetSubAgentId - The target sub-agent ID
 * @param options.relationType - The type of relation ('transfer' or 'delegate')
 * @returns Test agent relation data object
 *
 * @example
 * ```typescript
 * const relation = createTestAgentRelationData({
 *   graphId: 'my-graph',
 *   sourceSubAgentId: 'agent-1',
 *   targetSubAgentId: 'agent-2',
 *   relationType: 'transfer'
 * });
 * ```
 */
export function createTestAgentRelationData({
  graphId,
  sourceSubAgentId,
  targetSubAgentId,
  relationType = 'transfer',
}: {
  graphId: string;
  sourceSubAgentId: string;
  targetSubAgentId: string;
  relationType?: 'transfer' | 'delegate';
}) {
  return {
    id: nanoid(),
    graphId,
    sourceSubAgentId,
    targetSubAgentId,
    relationType,
  };
}

import type { FullAgentFormInputValues } from '@/components/agent/form/validation';

type SubAgentFormInput = NonNullable<FullAgentFormInputValues['subAgents']>[string];
type FunctionToolFormInput = NonNullable<FullAgentFormInputValues['functionTools']>[string];
type FunctionToolRelationFormInput = NonNullable<
  FullAgentFormInputValues['functionToolRelations']
>[string];
type MCPRelationFormInput = NonNullable<FullAgentFormInputValues['mcpRelations']>[string];

export function createSubAgentFormInput({
  id = '',
  name = 'Sub Agent',
}: {
  id?: string;
  name?: string;
} = {}): SubAgentFormInput {
  return {
    id,
    name,
    description: '',
    prompt: '',
    type: 'internal',
    models: {
      base: {},
      summarizer: {},
      structuredOutput: {},
    },
    canUse: [],
    dataComponents: [],
    artifactComponents: [],
    stopWhen: {},
    skills: [],
  };
}

export function createFunctionToolFormInput({
  functionId,
  name = 'Function Tool',
}: {
  functionId: string;
  name?: string;
}): FunctionToolFormInput {
  return {
    functionId,
    name,
    description: '',
    tempToolPolicies: {},
  };
}

export function getFunctionToolRelationFormKey({ nodeKey }: { nodeKey: string }): string {
  return nodeKey;
}

export function createFunctionToolRelationFormInput({
  relationshipId,
}: {
  relationshipId?: string | null;
} = {}): FunctionToolRelationFormInput {
  return {
    relationshipId: relationshipId ?? undefined,
  };
}

export function getMcpRelationFormKey({ nodeId }: { nodeId: string }): string {
  return nodeId;
}

export function createMcpRelationFormInput({
  toolId,
  relationshipId,
}: {
  toolId: string;
  relationshipId?: string | null;
}): MCPRelationFormInput {
  return {
    toolId,
    relationshipId: relationshipId ?? undefined,
    selectedTools: null,
    headers: '{}',
    toolPolicies: {},
  };
}

import type { FullAgentFormInputValues } from '@/components/agent/form/validation';

type SubAgentFormInput = NonNullable<FullAgentFormInputValues['subAgents']>[string];
type FunctionToolFormInput = NonNullable<FullAgentFormInputValues['functionTools']>[string];
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

export function getMcpRelationFormKey({
  nodeId,
  relationshipId,
}: {
  nodeId: string;
  relationshipId?: string | null;
}): string {
  return relationshipId ?? nodeId;
}

export function createMcpRelationFormInput({
  toolId,
  relationshipId,
  subAgentId,
}: {
  toolId: string;
  relationshipId?: string | null;
  subAgentId?: string | null;
}): MCPRelationFormInput {
  return {
    toolId,
    relationshipId: relationshipId ?? undefined,
    subAgentId: subAgentId ?? undefined,
    selectedTools: null,
    headers: '{}',
    toolPolicies: {},
  };
}

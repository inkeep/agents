import type { AgentMetadata, ContextConfig } from '@/components/agent/configuration/agent-types';
import type { FullAgentDefinition } from '@/lib/types/agent-full';
import { formatJsonField } from '@/lib/utils';

export type ExtendedFullAgentDefinition = FullAgentDefinition & {
  prompt?: string;
  contextConfig?: Partial<Pick<ContextConfig, 'id'>> & {
    contextVariables?: Record<string, any>;
    headersSchema?: Record<string, any>;
  };
};

/**
 * Extracts and formats agent metadata from a FullAgentDefinition object.
 * This helper function handles the complex transformation of the agent data
 * into the format expected by the AgentMetadata type, including proper
 * JSON field formatting for form compatibility.
 */
export function extractAgentMetadata(
  agent: ExtendedFullAgentDefinition | null | undefined
): AgentMetadata {
  return {
    id: agent?.id,
    name: agent?.name ?? '',
    description: agent?.description ?? '',
    prompt: agent?.prompt,
    models: agent?.models
      ? {
          base: agent.models.base
            ? {
                model: agent.models.base.model,
                providerOptions: formatJsonField(agent.models.base.providerOptions),
              }
            : undefined,
          structuredOutput: agent.models.structuredOutput
            ? {
                model: agent.models.structuredOutput.model,
                providerOptions: formatJsonField(agent.models.structuredOutput.providerOptions),
              }
            : undefined,
          summarizer: agent.models.summarizer
            ? {
                model: agent.models.summarizer.model,
                providerOptions: formatJsonField(agent.models.summarizer.providerOptions),
              }
            : undefined,
        }
      : undefined,
    stopWhen: agent?.stopWhen,
    statusUpdates: agent?.statusUpdates
      ? {
          ...agent.statusUpdates,
          statusComponents: formatJsonField(agent.statusUpdates.statusComponents) || '',
        }
      : undefined,
    contextConfig: {
      id: agent?.contextConfig?.id ?? '',
      contextVariables: formatJsonField(agent?.contextConfig?.contextVariables) || '',
      headersSchema: formatJsonField(agent?.contextConfig?.headersSchema) || '',
    },
  };
}

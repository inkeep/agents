import type { ContextConfig, GraphMetadata } from '@/components/agent/configuration/agent-types';
import type { FullGraphDefinition } from '@/lib/types/agent-full';
import { formatJsonField } from '@/lib/utils';

export type ExtendedFullGraphDefinition = FullGraphDefinition & {
  contextConfig?: Partial<Pick<ContextConfig, 'id'>> & {
    contextVariables?: Record<string, any>;
    headersSchema?: Record<string, any>;
  };
};

/**
 * Extracts and formats agent metadata from a FullGraphDefinition object.
 * This helper function handles the complex transformation of the agent data
 * into the format expected by the GraphMetadata type, including proper
 * JSON field formatting for form compatibility.
 */
export function extractGraphMetadata(
  agent: ExtendedFullGraphDefinition | null | undefined
): GraphMetadata {
  return {
    id: agent?.id,
    name: agent?.name ?? '',
    description: agent?.description ?? '',
    graphPrompt: agent?.graphPrompt,
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

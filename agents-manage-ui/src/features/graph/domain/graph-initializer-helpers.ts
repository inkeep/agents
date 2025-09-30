import type { ContextConfig, GraphMetadata } from '@/components/graph/configuration/graph-types';
import type { FullGraphDefinition } from '@/lib/types/graph-full';
import { formatJsonField } from '@/lib/utils';

export type ExtendedFullGraphDefinition = FullGraphDefinition & {
  contextConfig?: Partial<Pick<ContextConfig, 'id' | 'name' | 'description'>> & {
    contextVariables?: Record<string, any>;
    requestContextSchema?: Record<string, any>;
  };
};

/**
 * Extracts and formats graph metadata from a FullGraphDefinition object.
 * This helper function handles the complex transformation of the graph data
 * into the format expected by the GraphMetadata type, including proper
 * JSON field formatting for form compatibility.
 */
export function extractGraphMetadata(
  graph: ExtendedFullGraphDefinition | null | undefined
): GraphMetadata {
  return {
    id: graph?.id,
    name: graph?.name ?? '',
    description: graph?.description ?? '',
    graphPrompt: graph?.graphPrompt,
    models: graph?.models
      ? {
          base: graph.models.base
            ? {
                model: graph.models.base.model,
                providerOptions: formatJsonField(graph.models.base.providerOptions),
              }
            : undefined,
          structuredOutput: graph.models.structuredOutput
            ? {
                model: graph.models.structuredOutput.model,
                providerOptions: formatJsonField(graph.models.structuredOutput.providerOptions),
              }
            : undefined,
          summarizer: graph.models.summarizer
            ? {
                model: graph.models.summarizer.model,
                providerOptions: formatJsonField(graph.models.summarizer.providerOptions),
              }
            : undefined,
        }
      : undefined,
    stopWhen: graph?.stopWhen,
    statusUpdates: graph?.statusUpdates
      ? {
          ...graph.statusUpdates,
          statusComponents: formatJsonField(graph.statusUpdates.statusComponents) || '',
        }
      : undefined,
    contextConfig: {
      id: graph?.contextConfig?.id ?? '',
      name: graph?.contextConfig?.name ?? '',
      description: graph?.contextConfig?.description ?? '',
      contextVariables: formatJsonField(graph?.contextConfig?.contextVariables) || '',
      requestContextSchema: formatJsonField(graph?.contextConfig?.requestContextSchema) || '',
    },
  };
}

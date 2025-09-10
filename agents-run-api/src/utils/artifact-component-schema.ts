import type { ArtifactComponentApiSelect, DataComponentInsert } from '@inkeep/agents-core';
import { z } from 'zod';
import { getLogger } from '../logger';
import { jsonSchemaToZod } from './data-component-schema';

const _logger = getLogger('ArtifactComponentSchema');

/**
 * Converts artifact component configurations to Zod schema for structured generation
 */
export function createArtifactComponentsSchema(artifactComponents?: ArtifactComponentApiSelect[]) {
  // Convert artifact component configs to a union schema
  const componentSchemas =
    artifactComponents?.map((component) => {
      // Convert the JSON Schema props to Zod - handle both summaryProps and fullProps
      const summaryPropsSchema = jsonSchemaToZod(component.summaryProps);
      const fullPropsSchema = jsonSchemaToZod(component.fullProps);

      // Return schema with both summary and full props
      return z
        .object({
          id: z.string().describe(component.id),
          name: z.literal(component.name).describe(component.name),
          summaryProps: summaryPropsSchema,
          fullProps: fullPropsSchema,
        })
        .describe(`${component.name}: ${component.description}`);
    }) || [];

  // Return union of all component schemas - z.union requires at least 2 schemas
  if (componentSchemas.length === 0) {
    return z.object({}); // Empty object for no components
  }
  if (componentSchemas.length === 1) {
    return componentSchemas[0]; // Single schema doesn't need union
  }
  return z.union(componentSchemas as any); // Safe union with 2+ schemas
}

/**
 * Create schema for artifact component summary props only (for quick display)
 */
export function createArtifactComponentsSummarySchema(
  artifactComponents?: ArtifactComponentApiSelect[]
) {
  const componentSchemas =
    artifactComponents?.map((component) => {
      const summaryPropsSchema = jsonSchemaToZod(component.summaryProps);

      return z
        .object({
          id: z.string().describe(component.id),
          name: z.literal(component.name).describe(component.name),
          summaryProps: summaryPropsSchema,
        })
        .describe(`${component.name} Summary: ${component.description}`);
    }) || [];

  if (componentSchemas.length === 0) {
    return z.object({});
  }
  if (componentSchemas.length === 1) {
    return componentSchemas[0];
  }
  return z.union(componentSchemas as any);
}

/**
 * Create schema for artifact component full props only (for detailed display)
 */
export function createArtifactComponentsFullSchema(
  artifactComponents?: ArtifactComponentApiSelect[]
) {
  const componentSchemas =
    artifactComponents?.map((component) => {
      const fullPropsSchema = jsonSchemaToZod(component.fullProps);

      return z
        .object({
          id: z.string().describe(component.id),
          name: z.literal(component.name).describe(component.name),
          fullProps: fullPropsSchema,
        })
        .describe(`${component.name} Full: ${component.description}`);
    }) || [];

  if (componentSchemas.length === 0) {
    return z.object({});
  }
  if (componentSchemas.length === 1) {
    return componentSchemas[0];
  }
  return z.union(componentSchemas as any);
}

/**
 * Standard artifact reference component schema for tool responses
 */
export class ArtifactReferenceSchema {
  // Standard artifact props schema - single source of truth
  private static readonly ARTIFACT_PROPS_SCHEMA = {
    type: 'object',
    properties: {
      artifact_id: {
        type: 'string',
        description:
          'The EXACT artifact_id from save_tool_result tool output. NEVER invent or make up IDs.',
      },
      task_id: {
        type: 'string',
        description:
          'The EXACT task_id from save_tool_result tool output. NEVER invent or make up IDs.',
      },
    },
    required: ['artifact_id', 'task_id'],
  };

  /**
   * Get the standard Zod schema for artifact reference components
   */
  static getSchema(): z.ZodType<any> {
    return z.object({
      id: z.string(),
      name: z.literal('Artifact'),
      props: jsonSchemaToZod(ArtifactReferenceSchema.ARTIFACT_PROPS_SCHEMA),
    });
  }

  /**
   * Get complete DataComponent by adding missing fields to base definition
   */
  static getDataComponent(tenantId: string, projectId: string = ''): DataComponentInsert {
    return {
      id: 'The EXACT artifact_id from save_tool_result tool output. NEVER invent or make up IDs.',
      tenantId: tenantId,
      projectId: projectId,
      name: 'Artifact',
      description:
        'Reference to saved content from tool results that grounds information in verifiable sources.',
      props: ArtifactReferenceSchema.ARTIFACT_PROPS_SCHEMA,
    };
  }
}

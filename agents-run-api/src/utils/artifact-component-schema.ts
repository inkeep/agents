import type { ArtifactComponentApiInsert, ArtifactComponentApiSelect, DataComponentInsert } from '@inkeep/agents-core';
import { z } from 'zod';
import { getLogger } from '../logger';
import { jsonSchemaToZod } from './data-component-schema';
import { SchemaProcessor } from './SchemaProcessor';

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
          'The artifact_id from your artifact:create tag. Must match exactly.',
      },
      tool_call_id: {
        type: 'string',
        description:
          'The EXACT tool_call_id from tool execution (call_xyz789 or toolu_abc123). NEVER invent or make up IDs.',
      },
    },
    required: ['artifact_id', 'tool_call_id'],
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
      id: 'The artifact_id from your artifact:create tag. Must match exactly.',
      tenantId: tenantId,
      projectId: projectId,
      name: 'Artifact',
      description:
        'Reference to artifacts created from tool results that grounds information in verifiable sources.',
      props: ArtifactReferenceSchema.ARTIFACT_PROPS_SCHEMA,
    };
  }
}

/**
 * Standard artifact creation component schema for data components
 */
export class ArtifactCreateSchema {
  /**
   * Generate artifact create schemas - one for each artifact component type
   * @param artifactComponents - The available artifact components to generate schemas for
   * @returns Array of Zod schemas, one for each artifact component
   */
  static getSchemas(artifactComponents: Array<ArtifactComponentApiInsert | ArtifactComponentApiSelect>): z.ZodType<any>[] {
    return artifactComponents.map(component => {
      // Use SchemaProcessor to enhance the component's schemas with JMESPath guidance
      const enhancedSummaryProps = SchemaProcessor.enhanceSchemaWithJMESPathGuidance(component.summaryProps);
      const enhancedFullProps = SchemaProcessor.enhanceSchemaWithJMESPathGuidance(component.fullProps);

      const propsSchema = {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: `Unique artifact identifier for ${component.name} (e.g., "${component.name.toLowerCase()}-1")`,
          },
          tool_call_id: {
            type: 'string',
            description: 'The EXACT tool_call_id from tool execution (call_xyz789 or toolu_abc123). NEVER invent or make up IDs.',
          },
          type: {
            type: 'string',
            enum: [component.name],
            description: `Artifact type - must be "${component.name}"`,
          },
          base_selector: {
            type: 'string',
            description: 'JMESPath selector starting with "result." to navigate to ONE specific item. Summary/full props will be relative to this selection. Use filtering to avoid arrays (e.g., "result.items[?type==\'guide\']"). EXAMPLE: For JSON {"result":{"structuredContent":{"content":[{"type":"document","title":"Guide"}]}}} - WRONG: "result.content[?type==\'document\']" (skips structuredContent) - RIGHT: "result.structuredContent.content[?type==\'document\']".',
          },
          summary_props: enhancedSummaryProps,
          full_props: enhancedFullProps,
        },
        required: ['id', 'tool_call_id', 'type', 'base_selector'],
      };

      return z.object({
        id: z.string(),
        name: z.literal(`ArtifactCreate_${component.name}`),
        props: jsonSchemaToZod(propsSchema),
      });
    });
  }

  /**
   * Get DataComponents for artifact creation - one for each artifact component type
   * @param artifactComponents - The available artifact components to generate schemas for
   * @returns Array of DataComponent definitions, one for each artifact component
   */
  static getDataComponents(
    tenantId: string,
    projectId: string = '',
    artifactComponents: Array<ArtifactComponentApiInsert | ArtifactComponentApiSelect>
  ): DataComponentInsert[] {
    return artifactComponents.map(component => {
      // Use SchemaProcessor to enhance the component's schemas with JMESPath guidance
      const enhancedSummaryProps = SchemaProcessor.enhanceSchemaWithJMESPathGuidance(component.summaryProps);
      const enhancedFullProps = SchemaProcessor.enhanceSchemaWithJMESPathGuidance(component.fullProps);

      const propsSchema = {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: `Unique artifact identifier for ${component.name} (e.g., "${component.name.toLowerCase()}-1")`,
          },
          tool_call_id: {
            type: 'string',
            description: 'The EXACT tool_call_id from tool execution (call_xyz789 or toolu_abc123). NEVER invent or make up IDs.',
          },
          type: {
            type: 'string',
            enum: [component.name],
            description: `Artifact type - must be "${component.name}"`,
          },
          base_selector: {
            type: 'string',
            description: 'JMESPath selector starting with "result." to navigate to ONE specific item. Summary/full props will be relative to this selection. Use filtering to avoid arrays (e.g., "result.items[?type==\'guide\']"). EXAMPLE: For JSON {"result":{"structuredContent":{"content":[{"type":"document","title":"Guide"}]}}} - WRONG: "result.content[?type==\'document\']" (skips structuredContent) - RIGHT: "result.structuredContent.content[?type==\'document\']".',
          },
          summary_props: enhancedSummaryProps,
          full_props: enhancedFullProps,
        },
        required: ['id', 'tool_call_id', 'type', 'base_selector'],
      };

      return {
        id: `artifact-create-${component.name.toLowerCase().replace(/\s+/g, '-')}`,
        tenantId: tenantId,
        projectId: projectId,
        name: `ArtifactCreate_${component.name}`,
        description: `Create ${component.name} artifacts from tool results by extracting structured data using selectors.`,
        props: propsSchema,
      };
    });
  }
}

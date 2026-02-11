import { z } from '@hono/zod-openapi';
import type {
  ArtifactComponentApiInsert,
  ArtifactComponentApiSelect,
  DataComponentInsert,
} from '@inkeep/agents-core';
import type { JSONSchema } from 'zod/v4/core';
import { SchemaProcessor } from './SchemaProcessor';

/**
 * Standard artifact reference component schema for tool responses
 */
export class ArtifactReferenceSchema {
  // Standard artifact props schema - single source of truth
  private static readonly ARTIFACT_PROPS_SCHEMA: JSONSchema.BaseSchema = {
    type: 'object',
    properties: {
      artifact_id: {
        type: 'string',
        description: 'The artifact_id from your artifact:create tag. Must match exactly.',
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
      props: z.fromJSONSchema(ArtifactReferenceSchema.ARTIFACT_PROPS_SCHEMA),
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
  static getSchemas(
    artifactComponents: Array<ArtifactComponentApiInsert | ArtifactComponentApiSelect>
  ): z.ZodType<any>[] {
    return artifactComponents.map((component) => {
      // Use SchemaProcessor to enhance the component's unified props schema with JMESPath guidance
      const enhancedSchema = component.props
        ? SchemaProcessor.enhanceSchemaWithJMESPathGuidance(component.props)
        : { type: 'object', properties: {} };

      const propsSchema: JSONSchema.BaseSchema = {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: `Unique artifact identifier for ${component.name} (e.g., "${component.name.toLowerCase()}-1")`,
          },
          tool_call_id: {
            type: 'string',
            description:
              'The EXACT tool_call_id from tool execution (call_xyz789 or toolu_abc123). NEVER invent or make up IDs.',
          },
          type: {
            type: 'string',
            enum: [component.name],
            description: `Artifact type - must be "${component.name}"`,
          },
          base_selector: {
            type: 'string',
            description:
              'JMESPath selector starting with "result." to navigate to ONE specific item. Details selector will be relative to this selection. Use filtering to avoid arrays (e.g., "result.items[?type==\'guide\']").',
          },
          details_selector: enhancedSchema,
        },
        required: ['id', 'tool_call_id', 'type', 'base_selector'],
      };

      // Normalize schema for cross-provider compatibility
      const normalizedPropsSchema = SchemaProcessor.makeAllPropertiesRequired(propsSchema);

      return z.object({
        id: z.string(),
        name: z.literal(`ArtifactCreate_${component.name}`),
        props: z.fromJSONSchema(normalizedPropsSchema as JSONSchema.BaseSchema),
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
    projectId = '',
    artifactComponents: Array<ArtifactComponentApiInsert | ArtifactComponentApiSelect>
  ): DataComponentInsert[] {
    return artifactComponents.map((component) => {
      // Use SchemaProcessor to enhance the component's unified props schema with JMESPath guidance
      const enhancedSchema = component.props
        ? SchemaProcessor.enhanceSchemaWithJMESPathGuidance(component.props)
        : { type: 'object', properties: {} };

      const propsSchema: JSONSchema.BaseSchema = {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: `Unique artifact identifier for ${component.name} (e.g., "${component.name.toLowerCase()}-1")`,
          },
          tool_call_id: {
            type: 'string',
            description:
              'The EXACT tool_call_id from tool execution (call_xyz789 or toolu_abc123). NEVER invent or make up IDs.',
          },
          type: {
            type: 'string',
            enum: [component.name],
            description: `Artifact type - must be "${component.name}"`,
          },
          base_selector: {
            type: 'string',
            description:
              'JMESPath selector starting with "result." to navigate to ONE specific item. Details selector will be relative to this selection. Use filtering to avoid arrays (e.g., "result.items[?type==\'guide\']").',
          },
          details_selector: enhancedSchema,
        },
        required: ['id', 'tool_call_id', 'type', 'base_selector'],
      };

      // Normalize schema for cross-provider compatibility
      const normalizedPropsSchema = SchemaProcessor.makeAllPropertiesRequired(propsSchema);

      return {
        id: `artifact-create-${component.name.toLowerCase().replace(/\s+/g, '-')}`,
        tenantId: tenantId,
        projectId: projectId,
        name: `ArtifactCreate_${component.name}`,
        description: `Create ${component.name} artifacts from tool results by extracting structured data using selectors.`,
        props: normalizedPropsSchema as any,
      };
    });
  }
}

import { z } from '@hono/zod-openapi';
import { SENTINEL_KEY } from '../../constants/artifact-syntax';

const TOOL_CALL_ARG_REF_SCHEMA: Record<string, unknown> = {
  anyOf: [
    {
      type: 'object',
      required: [SENTINEL_KEY.ARTIFACT, SENTINEL_KEY.TOOL],
      properties: {
        [SENTINEL_KEY.ARTIFACT]: { type: 'string' },
        [SENTINEL_KEY.TOOL]: { type: 'string' },
        [SENTINEL_KEY.PATH]: { type: 'string' },
      },
      additionalProperties: true,
    },
    {
      type: 'object',
      required: [SENTINEL_KEY.TOOL],
      properties: {
        [SENTINEL_KEY.TOOL]: { type: 'string' },
        [SENTINEL_KEY.PATH]: { type: 'string' },
      },
      additionalProperties: true,
    },
  ],
};

function withToolCallArgRef(schemaNode: unknown): Record<string, unknown> {
  return {
    anyOf: [schemaNode, TOOL_CALL_ARG_REF_SCHEMA],
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function transformSchemaNode(schemaNode: unknown, isValuePosition: boolean): unknown {
  if (!isObjectRecord(schemaNode)) {
    return schemaNode;
  }

  const transformed: Record<string, unknown> = { ...schemaNode };

  if (isObjectRecord(schemaNode.properties)) {
    transformed.properties = Object.fromEntries(
      Object.entries(schemaNode.properties).map(([key, valueSchema]) => [
        key,
        transformSchemaNode(valueSchema, true),
      ])
    );
  }

  if (isObjectRecord(schemaNode.patternProperties)) {
    transformed.patternProperties = Object.fromEntries(
      Object.entries(schemaNode.patternProperties).map(([key, valueSchema]) => [
        key,
        transformSchemaNode(valueSchema, true),
      ])
    );
  }

  if (schemaNode.items !== undefined) {
    if (Array.isArray(schemaNode.items)) {
      transformed.items = schemaNode.items.map((item) => transformSchemaNode(item, true));
    } else {
      transformed.items = transformSchemaNode(schemaNode.items, true);
    }
  }

  if (isObjectRecord(schemaNode.additionalProperties)) {
    transformed.additionalProperties = transformSchemaNode(schemaNode.additionalProperties, true);
  }

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const variant = schemaNode[key];
    if (Array.isArray(variant)) {
      transformed[key] = variant.map((item) => transformSchemaNode(item, false));
    }
  }

  if (isObjectRecord(schemaNode.not)) {
    transformed.not = transformSchemaNode(schemaNode.not, false);
  }

  if (isObjectRecord(schemaNode.if)) {
    transformed.if = transformSchemaNode(schemaNode.if, false);
  }
  if (isObjectRecord(schemaNode.then)) {
    transformed['then'] = transformSchemaNode(schemaNode.then, false);
  }
  if (isObjectRecord(schemaNode.else)) {
    transformed.else = transformSchemaNode(schemaNode.else, false);
  }

  return isValuePosition ? withToolCallArgRef(transformed) : transformed;
}

export function makeRefAwareJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return transformSchemaNode(schema, false) as Record<string, unknown>;
}

export function makeBaseInputSchema(
  schema: Record<string, unknown>
): ReturnType<typeof z.fromJSONSchema> {
  return z.fromJSONSchema(schema);
}

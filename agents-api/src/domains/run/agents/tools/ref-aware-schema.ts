import { z } from '@hono/zod-openapi';
import { SENTINEL_KEY } from '../../constants/artifact-syntax';

export const TOOL_CHAINING_SCHEMA_DESCRIPTIONS = {
  ROOT:
    'TOOL CHAINING: All parameters in this tool accept tool chaining references as an alternative to literal values. ' +
    'When data originated from ANY prior tool call or artifact, you MUST pass a reference object instead of copying the value inline — ' +
    'even if the data is visible in your context. The system resolves references to actual data before execution. ' +
    'This works for ALL parameter types: strings, numbers, booleans, objects, and arrays. ' +
    'Use "$select" (JMESPath) to extract a specific field when the tool expects a primitive but the source is a complex object. ' +
    'Check _structureHints.exampleSelectors in prior tool results for verified $select paths.',

  ARTIFACT_REF:
    'TOOL CHAINING from an artifact. PREFERRED when the data was saved as an artifact. ' +
    'Pass { "$artifact": "<artifact_id>", "$tool": "<tool_call_id>" } and the system delivers the full artifact data to this parameter. ' +
    'Add "$select" to extract a specific field. The artifact_id comes from artifact:create or available_artifacts.',

  TOOL_REF:
    'TOOL CHAINING from a prior tool result. PREFERRED over copying data inline. ' +
    'Pass { "$tool": "<tool_call_id>" } and the system delivers that tool\'s full output to this parameter. ' +
    'Add "$select" to extract a specific field. The tool_call_id is the _toolCallId from the prior tool result.',

  ARTIFACT_ID:
    'The artifact ID to chain from. Found in artifact:create responses or the available_artifacts list.',

  TOOL_CALL_ID:
    'The _toolCallId from the prior tool result to chain from. Every tool result includes a _toolCallId field — use it exactly as provided.',

  SELECT:
    'JMESPath expression to extract a specific field from the chained data. ' +
    'Check _structureHints.exampleSelectors in the source tool result for verified paths. ' +
    'REQUIRED when this parameter expects a primitive (string, number, boolean) but the source is a complex object. ' +
    'The "result." prefix is automatically stripped if present.',
} as const;

const PARAM_REF_SCHEMA: Record<string, unknown> = {
  anyOf: [
    {
      type: 'object',
      description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.ARTIFACT_REF,
      required: [SENTINEL_KEY.ARTIFACT, SENTINEL_KEY.TOOL],
      properties: {
        [SENTINEL_KEY.ARTIFACT]: {
          type: 'string',
          description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.ARTIFACT_ID,
        },
        [SENTINEL_KEY.TOOL]: {
          type: 'string',
          description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.TOOL_CALL_ID,
        },
        [SENTINEL_KEY.SELECT]: {
          type: 'string',
          description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.SELECT,
        },
      },
      additionalProperties: true,
    },
    {
      type: 'object',
      description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.TOOL_REF,
      required: [SENTINEL_KEY.TOOL],
      properties: {
        [SENTINEL_KEY.TOOL]: {
          type: 'string',
          description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.TOOL_CALL_ID,
        },
        [SENTINEL_KEY.SELECT]: {
          type: 'string',
          description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.SELECT,
        },
      },
      additionalProperties: true,
    },
  ],
};

function withToolRef(schemaNode: unknown): Record<string, unknown> {
  const wrapper: Record<string, unknown> = {
    anyOf: [schemaNode, PARAM_REF_SCHEMA],
  };
  if (isObjectRecord(schemaNode) && typeof schemaNode.description === 'string') {
    wrapper.description = schemaNode.description;
  }
  return wrapper;
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
    // biome-ignore lint/suspicious/noThenProperty: JSON Schema conditional keyword
    transformed.then = transformSchemaNode(schemaNode.then, false);
  }
  if (isObjectRecord(schemaNode.else)) {
    transformed.else = transformSchemaNode(schemaNode.else, false);
  }

  return isValuePosition ? withToolRef(transformed) : transformed;
}

export function makeRefAwareJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const transformed = transformSchemaNode(schema, false) as Record<string, unknown>;
  const existingDesc =
    typeof transformed.description === 'string' ? `${transformed.description} ` : '';
  transformed.description = `${existingDesc}${TOOL_CHAINING_SCHEMA_DESCRIPTIONS.ROOT}`;
  return transformed;
}

export function makeBaseInputSchema(
  schema: Record<string, unknown>
): ReturnType<typeof z.fromJSONSchema> {
  return z.fromJSONSchema(schema);
}

import { z } from '@hono/zod-openapi';
import { convertZodToJsonSchema } from '@inkeep/agents-core';
import { jsonSchema } from 'ai';
import { SENTINEL_KEY } from '../../constants/artifact-syntax';

export const REFS_KEY = '$refs';

export const TOOL_CHAINING_SCHEMA_DESCRIPTIONS = {
  ROOT:
    'TOOL CHAINING: When data originated from a prior tool call or artifact, use the $refs property to pass references instead of copying values inline. ' +
    'Set the referenced parameter to null and add an entry in $refs with the parameter name as key. ' +
    'The system resolves references to actual data before execution. ' +
    'Use "$select" (JMESPath) to extract a specific field. ' +
    'Check _structureHints.exampleSelectors in prior tool results for verified $select paths.',

  REFS_PROPERTY:
    'Map of parameter names to tool chaining references. Each key is a parameter name, each value is a reference object. ' +
    'Set the corresponding parameter to null — the system replaces it with the resolved data before execution.',

  ARTIFACT_REF:
    'Reference an artifact. Pass { "$artifact": "<artifact_id>", "$tool": "<tool_call_id>" }. Add "$select" to extract a specific field.',

  TOOL_REF:
    'Reference a prior tool result. Pass { "$tool": "<tool_call_id>" }. Add "$select" to extract a specific field.',

  ARTIFACT_ID: 'The artifact ID from artifact:create or available_artifacts.',

  TOOL_CALL_ID: 'The _toolCallId from the prior tool result.',

  SELECT:
    'JMESPath expression to extract a specific field. Check _structureHints.exampleSelectors for verified paths. The "result." prefix is auto-stripped.',
} as const;

const REFS_ENTRY_SCHEMA: Record<string, unknown> = {
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
      additionalProperties: false,
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
      additionalProperties: false,
    },
  ],
};

const REFS_PROPERTY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: TOOL_CHAINING_SCHEMA_DESCRIPTIONS.REFS_PROPERTY,
  additionalProperties: REFS_ENTRY_SCHEMA,
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Make a schema node nullable by adding "null" to its type.
 * For simple types: `{ type: "string" }` → `{ type: ["string", "null"] }`
 * For complex types (anyOf/oneOf/allOf): adds `{ type: "null" }` as a branch.
 */
function makeNullable(schemaNode: Record<string, unknown>): Record<string, unknown> {
  if (typeof schemaNode.type === 'string') {
    return { ...schemaNode, type: [schemaNode.type, 'null'] };
  }

  if (Array.isArray(schemaNode.type)) {
    if (schemaNode.type.includes('null')) {
      return schemaNode;
    }
    return { ...schemaNode, type: [...schemaNode.type, 'null'] };
  }

  for (const key of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(schemaNode[key])) {
      const branches = schemaNode[key] as unknown[];
      const hasNull = branches.some((b) => isObjectRecord(b) && b.type === 'null');
      if (hasNull) return schemaNode;
      return { ...schemaNode, [key]: [...branches, { type: 'null' }] };
    }
  }

  return { ...schemaNode, type: ['object', 'null'] };
}

/**
 * Transform a tool's JSON Schema for tool chaining support.
 *
 * Instead of wrapping every property with `anyOf` (which bloats the schema
 * and breaks Anthropic's constrained JSON generation), this approach:
 *
 * 1. Makes each property nullable — `type: "string"` → `type: ["string", "null"]`
 * 2. Adds a single `$refs` property at the root for tool chaining references
 *
 * The model passes `null` for referenced parameters and includes the reference
 * in `$refs`. The resolution logic replaces nulls with resolved data.
 */
export function makeRefAwareJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const transformed: Record<string, unknown> = { ...schema };

  if (isObjectRecord(schema.properties)) {
    transformed.properties = {
      ...Object.fromEntries(
        Object.entries(schema.properties).map(([key, valueSchema]) => [
          key,
          isObjectRecord(valueSchema) ? makeNullable(valueSchema) : valueSchema,
        ])
      ),
      [REFS_KEY]: REFS_PROPERTY_SCHEMA,
    };
  } else {
    transformed.properties = { [REFS_KEY]: REFS_PROPERTY_SCHEMA };
  }

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

/**
 * Build both the ref-aware input schema (for the LLM tool definition) and
 * the base input schema (for post-resolution validation).
 *
 * Accepts either a raw JSON Schema object or a Zod schema. Zod schemas are
 * converted via `convertZodToJsonSchema` from agents-core.
 *
 * Uses `jsonSchema()` from the AI SDK to send the JSON Schema directly to
 * the provider — avoiding the lossy `z.fromJSONSchema()` → `zodToJsonSchema`
 * round-trip.
 */
export function buildRefAwareSchemas(inputSchema: Record<string, unknown> | z.ZodType): {
  refAwareInputSchema: ReturnType<typeof jsonSchema>;
  baseInputSchema: ReturnType<typeof z.fromJSONSchema> | undefined;
} {
  const rawJson =
    inputSchema instanceof z.ZodType
      ? (convertZodToJsonSchema(inputSchema) as Record<string, unknown>)
      : inputSchema;

  let baseInputSchema: ReturnType<typeof z.fromJSONSchema> | undefined;
  try {
    baseInputSchema = makeBaseInputSchema(rawJson);
  } catch {
    baseInputSchema = undefined;
  }

  const refAwareInputSchema = jsonSchema(makeRefAwareJsonSchema(rawJson));

  return { refAwareInputSchema, baseInputSchema };
}

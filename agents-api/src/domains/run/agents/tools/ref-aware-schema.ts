import { z } from '@hono/zod-openapi';
import { convertZodToJsonSchema } from '@inkeep/agents-core';
import { jsonSchema } from 'ai';
import { getLogger } from '../../../../logger';
import { REFS_KEY, SENTINEL_KEY } from '../../constants/artifact-syntax';

export { REFS_KEY };

const logger = getLogger('ref-aware-schema');

export const TOOL_CHAINING_SCHEMA_DESCRIPTIONS = {
  ROOT:
    `TOOL CHAINING — pass data from a prior tool call or artifact without copying it inline. ` +
    `HOW: set the parameter you want to chain to null, and add an entry under "${SENTINEL_KEY.REFS}" whose key is that parameter's name. ` +
    `The entry value is { "${SENTINEL_KEY.TOOL}": "<prior tool call id>" } (use the "_toolCallId" from that prior tool result), ` +
    `optionally with "${SENTINEL_KEY.SELECT}": "<JMESPath>" to pick a specific field, ` +
    `or { "${SENTINEL_KEY.ARTIFACT}": "<artifact id>", "${SENTINEL_KEY.TOOL}": "<tool call id>" } to reference a saved artifact. ` +
    `EXAMPLE — a fetch tool calling a URL discovered by a prior search: ` +
    `{ "url": null, "method": "GET", "${SENTINEL_KEY.REFS}": { "url": { "${SENTINEL_KEY.TOOL}": "call_abc123", "${SENTINEL_KEY.SELECT}": "items[0].url" } } }. ` +
    `RULES: always prefer chaining over inlining values the prior tool produced; ` +
    `check _structureHints.exampleSelectors in prior tool results for verified ${SENTINEL_KEY.SELECT} paths; ` +
    `omit "${SENTINEL_KEY.REFS}" entirely when you aren't chaining any parameters.`,

  REFS_PROPERTY:
    `Map of { paramName: referenceObject } for parameters whose values come from prior tool results or artifacts. ` +
    `Only include entries for parameters you are chaining; set those same parameters to null at the top level. ` +
    `Leave out this property entirely when not chaining.`,

  ARTIFACT_REF: `Reference an artifact by id. Shape: { "${SENTINEL_KEY.ARTIFACT}": "<artifact_id>", "${SENTINEL_KEY.TOOL}": "<tool_call_id>" }. Optional "${SENTINEL_KEY.SELECT}" (JMESPath) to extract a specific field from the artifact data.`,

  TOOL_REF: `Reference a prior tool result by its call id. Shape: { "${SENTINEL_KEY.TOOL}": "<tool_call_id>" }. Optional "${SENTINEL_KEY.SELECT}" (JMESPath) to extract a specific field from that result.`,

  ARTIFACT_ID:
    'The artifact ID — from an artifact:create response or the available_artifacts list.',

  TOOL_CALL_ID:
    'The exact "_toolCallId" value from a prior tool result in this conversation. Never invent one.',

  SELECT:
    `JMESPath expression applied to the resolved data (e.g. "items[0].url", "metadata.total"). ` +
    `Use when you need a specific field rather than the whole result. ` +
    `Prefer values from _structureHints.exampleSelectors on the source tool result. ` +
    `The "result." prefix is auto-stripped if included.`,
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
 * For union types (anyOf/oneOf): adds `{ type: "null" }` as a branch.
 * Note: `allOf` schemas fall through to the default branch; adding null to an
 * allOf composition has different semantics than anyOf/oneOf, so we do not
 * attempt to mutate allOf branches here.
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

  // For allOf, wrap the whole composition in anyOf with null rather than
  // mutating the allOf branches (adding null to allOf has different semantics).
  if (Array.isArray(schemaNode.allOf)) {
    return { anyOf: [schemaNode, { type: 'null' }] };
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
 * 2. Adds a single `SENTINEL_KEY.REFS` property at the root for tool chaining references
 *
 * The model passes `null` for referenced parameters and includes the reference
 * in `SENTINEL_KEY.REFS`. The resolution logic replaces nulls with resolved data.
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
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to build base input schema; post-resolution validation will be skipped'
    );
    baseInputSchema = undefined;
  }

  const refAwareInputSchema = jsonSchema(makeRefAwareJsonSchema(rawJson));

  return { refAwareInputSchema, baseInputSchema };
}

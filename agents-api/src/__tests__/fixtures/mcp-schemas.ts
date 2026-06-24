/**
 * Pydantic-style MCP tool input schemas used to verify faithful schema handling
 * ($ref/$defs, nested objects, anyOf nullables, enums, recursion).
 */

// Modeled on Recall.ai's get_info tool: a $ref to a nested required object,
// an anyOf [string, null] nullable, and an enum.
export const recallGetInfoSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    workspace_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      default: null,
      description: 'Optional workspace UUID.',
    },
    api_version: {
      type: 'string',
      enum: ['v1.10', 'v1.11'],
      description: 'Workspace API version.',
    },
    telemetry: { $ref: '#/$defs/McpToolTelemetry' },
  },
  required: ['telemetry'],
  $defs: {
    McpToolTelemetry: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'Why this tool was chosen.' },
      },
      required: ['intent'],
    },
  },
};

// Self-referential schema to exercise cycle safety.
export const recursiveTreeSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    value: { type: 'string' },
    children: { type: 'array', items: { $ref: '#' } },
  },
  required: ['value'],
};

// Nested data-component schema (object with a nested object + enum).
export const nestedDataComponentSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Card title' },
    author: {
      type: 'object',
      description: 'Author info',
      properties: {
        name: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'member'] },
      },
      required: ['name'],
    },
  },
  required: ['title'],
};

// Data-component schema with an array of nested objects, to verify array items
// are not truncated to type-only.
export const arrayItemDataComponentSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'low'] },
        },
        required: ['label'],
      },
    },
  },
};

// Pydantic-style `allOf` composition: a $ref combined with an extra description.
export const allOfSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    config: {
      allOf: [{ $ref: '#/$defs/Cfg' }],
      description: 'Composed config.',
    },
  },
  required: ['config'],
  $defs: {
    Cfg: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['fast', 'safe'] } },
      required: ['mode'],
    },
  },
};

// Same shape as recallGetInfo but using the draft-07 `definitions` keyword.
export const definitionsKeywordSchema: Record<string, unknown> = {
  type: 'object',
  properties: { telemetry: { $ref: '#/definitions/Telemetry' } },
  required: ['telemetry'],
  definitions: {
    Telemetry: {
      type: 'object',
      properties: { intent: { type: 'string' } },
      required: ['intent'],
    },
  },
};

// Pydantic v2 `Optional[Model]`: a nullable $ref. The referenced structure must
// survive unwrapping the null branch.
export const nullableRefSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    config: { anyOf: [{ $ref: '#/$defs/Cfg' }, { type: 'null' }] },
  },
  $defs: {
    Cfg: {
      type: 'object',
      properties: { mode: { type: 'string' } },
      required: ['mode'],
    },
  },
};

// Genuine multi-branch union (not a nullable): a scalar branch and an object branch.
export const multiBranchUnionSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    target: {
      anyOf: [
        { type: 'string', description: 'a bare id' },
        { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
      ],
      description: 'id or object',
    },
  },
  required: ['target'],
};

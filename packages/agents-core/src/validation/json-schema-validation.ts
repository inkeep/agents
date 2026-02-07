import { z } from 'zod';

// Zod schema for valid JSON Schema Draft 7
const JsonSchemaPropertySchema = z.object({
  type: z.enum(
    ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'],
    'Each property must have a valid "type"'
  ),
  description: z
    .string('Each property must have a "description" for LLM compatibility')
    .trim()
    .nonempty('Each property must have a non-empty description for LLM compatibility'),
  // Optional properties that can be present in JSON Schema
  format: z.string().optional(),
  pattern: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  items: z.unknown().optional(),
  properties: z.unknown().optional(),
  enum: z.array(z.unknown()).optional(),
  const: z.unknown().optional(),
  default: z.unknown().optional(),
});

export const JsonSchemaForLlmSchema = z
  .object({
    type: z.literal('object', 'Schema must have type: "object" for LLM compatibility'),
    properties: z.record(
      z.string(),
      JsonSchemaPropertySchema,
      'Schema must have a "properties" object'
    ),
    // TODO check if required can be empty array
    required: z.array(z.string(), 'Schema must have a "required" array').nonempty(),
    // Optional object properties
    additionalProperties: z.boolean().optional(),
    description: z.string().trim().optional(),
  })
  .superRefine((schema, ctx) => {
    for (const requiredProp of schema.required) {
      if (schema.properties[requiredProp]) continue;
      ctx.addIssue({
        code: 'custom',
        path: ['required'],
        message: `Required property "${requiredProp}" must exist in properties`,
      });
    }
  });

/**
 * Used in z.transform()
 */
export function transformToJson<T extends string>(value: T, ctx: z.RefinementCtx<T>) {
  try {
    return JSON.parse(value);
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid JSON syntax',
    });
    return z.NEVER;
  }
}

import { z } from '@hono/zod-openapi';

interface PrimitiveSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'null';
}

interface ArraySchema {
  type: 'array';
  items?: JsonSchemaProperty | JsonSchemaProperty[];
}

interface ObjectSchema {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
}

export type JsonSchemaProperty = (PrimitiveSchema | ArraySchema | ObjectSchema) & {
  [key: string]: unknown;
  description: string;
};

export type JsonSchemaForLlmSchemaType = z.infer<typeof JsonSchemaForLlmSchema>;

const JsonSchemaPropertyLazySchema = z
  .lazy(() => JsonSchemaPropertySchema)
  /**
   * @hono/zod-openapi does not support z.lazy
   * @see https://github.com/honojs/middleware/issues/643#issuecomment-2265271987
   */
  .meta({
    type: 'object',
    $ref: '#/components/schemas/JsonSchemaPropertySchema',
  });

const JsonSchemaDescription = z
  .string('Each property must have a "description" for LLM compatibility')
  .trim()
  .nonempty('Each property must have a non-empty description for LLM compatibility')
  .openapi('JsonSchemaPropertyDescription');

/**
 * Zod schema representing a valid JSON Schema Draft 7 property.
 *
 * `z.lazy` are used for recursive fields (`items`, `properties`) so the schema
 * can reference itself without causing an infinite loop at definition time.
 * Without `z.lazy`, Zod would hit an infinite loop at definition time, not at runtime.
 */
const JsonSchemaPropertySchema: z.ZodType<JsonSchemaProperty> = z
  .discriminatedUnion(
    'type',
    [
      z.looseObject({
        type: z.enum(['string', 'number', 'integer', 'boolean', 'null']),
        description: JsonSchemaDescription,
      }),
      z.looseObject({
        type: z.literal('array'),
        description: JsonSchemaDescription,
        /**
         * Recursive schema definition for array items.
         * A schema may define a single item schema or an array of schemas.
         */
        items: z
          .union([JsonSchemaPropertyLazySchema, z.array(JsonSchemaPropertyLazySchema)])
          .optional(),
      }),
      z.looseObject({
        type: z.literal('object'),
        description: JsonSchemaDescription,
        /**
         * Recursive schema definition for object properties.
         * Each property value is itself a JSON Schema.
         */
        properties: z.record(z.string(), JsonSchemaPropertyLazySchema).optional(),
      }),
    ],
    'Each property must have a valid "type"'
  )
  .openapi('JsonSchemaPropertySchema');

export const JsonSchemaForLlmSchema = z
  .looseObject(
    {
      type: z.literal('object', 'Schema must have type: "object" for LLM compatibility'),
      properties: z.record(
        z.string(),
        JsonSchemaPropertySchema,
        'Schema must have a "properties" object'
      ),
      required: z.array(z.string(), 'Schema must have a "required" array').default([]).optional(),
      // Optional object properties
      additionalProperties: z.boolean().optional(),
      description: z.string().trim().optional(),
    },
    'Schema must be an object'
  )
  .superRefine((schema, ctx) => {
    for (const requiredProp of schema.required ?? []) {
      if (schema.properties[requiredProp]) continue;
      ctx.addIssue({
        code: 'custom',
        path: ['required'],
        message: `Required property "${requiredProp}" must exist in properties`,
      });
    }
  })
  .openapi('JsonSchemaForLlmSchema');

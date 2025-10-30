import { convertJsonSchemaToFields } from '@/components/form/json-schema-builder';
import type { JSONSchema7 } from 'json-schema';

const JSONSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    nested: {
      description: 'nested object',
      type: 'object',
      properties: {
        nested2: {
          description: 'another nested object',
          type: 'object',
          properties: {
            string: {
              description: 'string description',
              type: 'string',
            },
            number: {
              description: 'number description',
              type: 'number',
            },
            integer: {
              description: 'integer description',
              type: 'integer',
            },
            boolean: {
              description: 'boolean description',
              type: 'boolean',
            },
            enum: {
              description: 'enum description',
              type: 'string',
              enum: ['foo', 'bar', 'baz'],
            },
            array: {
              description: 'array description',
              type: 'array',
              items: {
                description: 'array item description',
                type: 'object',
                properties: {
                  prop: {
                    description: 'array string item description',
                    type: 'string',
                  },
                },
              },
            },
            unknown: {
              // @ts-expect-error
              type: 'UNKNOWN',
            },
          },
          additionalProperties: false,
          required: ['string', 'integer', 'enum'],
        },
      },
    },
  },
  required: ['nested'],
  additionalProperties: false,
};

describe('convertJsonSchemaToFields', () => {
  it('should converts json schema to fields', () => {
    const schema = convertJsonSchemaToFields(JSONSchema);
    expect(schema).toMatchInlineSnapshot(`
      {
        "properties": [
          {
            "description": "nested object",
            "isRequired": true,
            "name": "nested",
            "properties": [
              {
                "description": "another nested object",
                "name": "nested2",
                "properties": [
                  {
                    "description": "string description",
                    "isRequired": true,
                    "name": "string",
                    "type": "string",
                  },
                  {
                    "description": "number description",
                    "name": "number",
                    "type": "number",
                  },
                  {
                    "description": "integer description",
                    "isRequired": true,
                    "name": "integer",
                    "type": "number",
                  },
                  {
                    "description": "boolean description",
                    "name": "boolean",
                    "type": "boolean",
                  },
                  {
                    "description": "enum description",
                    "isRequired": true,
                    "name": "enum",
                    "type": "enum",
                    "values": [
                      "foo",
                      "bar",
                      "baz",
                    ],
                  },
                  {
                    "description": "array description",
                    "items": {
                      "description": "array item description",
                      "properties": [
                        {
                          "description": "array string item description",
                          "name": "prop",
                          "type": "string",
                        },
                      ],
                      "type": "object",
                    },
                    "name": "array",
                    "type": "array",
                  },
                ],
                "type": "object",
              },
            ],
            "type": "object",
          },
        ],
        "type": "object",
      }
    `);
  });
});

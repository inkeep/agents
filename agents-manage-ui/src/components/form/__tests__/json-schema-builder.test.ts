import { convertJsonSchemaToFields } from '@/components/form/json-schema-builder';
import type { RJSFSchema } from '@rjsf/utils';

const JSONSchema: RJSFSchema = {
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
            "name": "nested",
            "properties": [
              {
                "description": "another nested object",
                "name": "nested2",
                "properties": [
                  {
                    "description": "string description",
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

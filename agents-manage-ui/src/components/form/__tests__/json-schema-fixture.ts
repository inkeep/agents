import type { JSONSchema7 } from 'json-schema';

export const JSONSchemaFixture: JSONSchema7 = {
  type: 'object',
  properties: {
    string: {
      title: 'My string',
      description: 'string description',
      type: 'string',
    },
    number: {
      title: 'My number',
      description: 'number description',
      type: 'number',
    },
    new: {
      description: 'nested object',
      type: 'object',
      properties: {
        newString: {
          title: 'My new string',
          description: 'string description',
          type: 'string',
        },
      },
    },
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

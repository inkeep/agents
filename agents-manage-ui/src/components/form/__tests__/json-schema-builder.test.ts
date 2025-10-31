import type { JSONSchema7 } from 'json-schema';
import { convertJsonSchemaToFields } from '@/components/form/json-schema-builder';
import { JSONSchemaFixture } from './json-schema-fixture';

const schemaWithRef: JSONSchema7 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Order',
  type: 'object',
  properties: {
    orderId: { type: 'string' },
    customer: { $ref: '#/definitions/user' },
    items: {
      type: 'array',
      items: { $ref: '#/definitions/item' },
    },
  },
  required: ['orderId', 'customer', 'items'],
  definitions: {
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['id', 'name'],
    },
    item: {
      type: 'object',
      properties: {
        sku: { type: 'string' },
        quantity: { type: 'integer', minimum: 1 },
      },
      required: ['sku', 'quantity'],
    },
  },
};

const schemaWithRefResult: JSONSchema7 = {
  type: 'object',
  properties: {
    orderId: {
      type: 'string',
      default: '',
    },
    customer: {
      type: 'string',
      default: '',
    },
    items: {
      type: 'array',
      items: {
        type: 'string',
      },
      default: [],
    },
  },
  additionalProperties: false,
  required: ['orderId', 'customer', 'items'],
  title: 'Order',
};

const schemaWithAnyOf: JSONSchema7 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'User Contact',
  type: 'object',
  properties: {
    contact: {
      description: 'User contact can be either an email or a phone number',
      anyOf: [
        {
          type: 'string',
          format: 'email',
          description: 'Email address',
        },
        {
          type: 'string',
          pattern: '^\\+?[0-9\\-]{7,15}$',
          description: 'Phone number (E.164 format or similar)',
        },
      ],
    },
  },
  required: ['contact'],
};

const schemaWithAnyOfResult: JSONSchema7 = {
  type: 'object',
  properties: {
    contact: {
      type: 'string',
      description: 'User contact can be either an email or a phone number',
      default: '',
    },
  },
  additionalProperties: false,
  required: ['contact'],
  title: 'User Contact',
};

describe('convertJsonSchemaToFields', () => {
  it('should converts json schema to fields', () => {
    const schema = convertJsonSchemaToFields(JSONSchemaFixture);
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

import type { JSONSchema7 } from 'json-schema';
import {
  convertJsonSchemaToFields,
  type EditableField,
  fieldsToJsonSchema,
  type JSONSchemaWithPreview,
} from '@/features/agent/state/json-schema';
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
    },
    customer: {
      type: 'string',
    },
    items: {
      type: 'array',
      items: {
        type: 'string',
      },
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
    },
  },
  additionalProperties: false,
  required: ['contact'],
  title: 'User Contact',
};

const schemaWithPreview: JSONSchema7 = {
  type: 'object',
  properties: {
    title: { type: 'string', inPreview: true } as JSONSchemaWithPreview,
    body: { type: 'string' },
  },
};

const fieldsWithPreview: EditableField = {
  id: '__root__',
  type: 'object',
  properties: [
    {
      id: '__root__.title',
      isPreview: true,
      name: 'title',
      type: 'string',
    },
    {
      id: '__root__.body',
      name: 'body',
      type: 'string',
    },
  ],
};

describe('convertJsonSchemaToFields', () => {
  it('should converts json schema to fields', () => {
    const schema = convertJsonSchemaToFields({ schema: JSONSchemaFixture });
    expect(schema).toEqual({
      id: '__root__',
      properties: [
        {
          id: '__root__.string',
          description: 'string description',
          name: 'string',
          title: 'My string',
          type: 'string',
        },
        {
          id: '__root__.number',
          description: 'number description',
          name: 'number',
          title: 'My number',
          type: 'number',
        },
        {
          id: '__root__.new',
          description: 'nested object',
          name: 'new',
          properties: [
            {
              id: '__root__.new.newString',
              description: 'string description',
              name: 'newString',
              title: 'My new string',
              type: 'string',
            },
          ],
          type: 'object',
        },
        {
          id: '__root__.nested',
          description: 'nested object',
          isRequired: true,
          name: 'nested',
          properties: [
            {
              id: '__root__.nested.nested2',
              description: 'another nested object',
              name: 'nested2',
              properties: [
                {
                  id: '__root__.nested.nested2.string',
                  description: 'string description',
                  isRequired: true,
                  name: 'string',
                  type: 'string',
                },
                {
                  id: '__root__.nested.nested2.number',
                  description: 'number description',
                  name: 'number',
                  type: 'number',
                },
                {
                  id: '__root__.nested.nested2.integer',
                  description: 'integer description',
                  isRequired: true,
                  name: 'integer',
                  type: 'number',
                },
                {
                  id: '__root__.nested.nested2.boolean',
                  description: 'boolean description',
                  name: 'boolean',
                  type: 'boolean',
                },
                {
                  id: '__root__.nested.nested2.enum',
                  description: 'enum description',
                  isRequired: true,
                  name: 'enum',
                  type: 'enum',
                  values: ['foo', 'bar', 'baz'],
                },
                {
                  id: '__root__.nested.nested2.array',
                  description: 'array description',
                  items: {
                    id: '__root__.nested.nested2.array.[]',
                    description: 'array item description',
                    properties: [
                      {
                        id: '__root__.nested.nested2.array.[].prop',
                        description: 'array string item description',
                        name: 'prop',
                        type: 'string',
                      },
                    ],
                    type: 'object',
                  },
                  name: 'array',
                  type: 'array',
                },
                {
                  id: '__root__.nested.nested2.unknown',
                  name: 'unknown',
                  type: 'string',
                },
              ],
              type: 'object',
            },
          ],
          type: 'object',
        },
      ],
      type: 'object',
    });
  });

  it('should fallback when JSON schema contains $ref', () => {
    const schema = convertJsonSchemaToFields({ schema: schemaWithRef });
    expect(fieldsToJsonSchema(schema)).toEqual(schemaWithRefResult);
  });
  it('should fallback when JSON schema contains anyOf', () => {
    const schema = convertJsonSchemaToFields({ schema: schemaWithAnyOf });
    expect(fieldsToJsonSchema(schema)).toEqual(schemaWithAnyOfResult);
  });

  it('should include preview flags when enabled', () => {
    const schema = convertJsonSchemaToFields({
      schema: schemaWithPreview,
      hasInPreview: true,
    });
    expect(schema).toEqual(fieldsWithPreview);
  });

  it('should ignore preview flags when disabled', () => {
    const schema = fieldsToJsonSchema(fieldsWithPreview);
    expect(schema.properties?.title).toEqual({ type: 'string' });
  });
});

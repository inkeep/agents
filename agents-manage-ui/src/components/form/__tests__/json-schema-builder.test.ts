import { convertJsonSchemaToFields } from '@/components/form/json-schema-builder';
import { JSONSchemaFixture } from './json-schema-fixture';

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

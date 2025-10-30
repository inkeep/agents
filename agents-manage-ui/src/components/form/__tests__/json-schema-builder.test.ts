import { convertJsonSchemaToFields } from '@/components/form/json-schema-builder';
import type { RJSFSchema } from '@rjsf/utils';

const JSONSchema: RJSFSchema = {
  type: 'object',
  properties: {
    activities: {
      description: 'The list of activities',
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            description: 'The main title of the event or activity category',
            type: 'string',
          },
          category: {
            description: 'The type of event',
            type: 'string',
            enum: ['Festival', 'Fitness', 'Outdoor Activity', 'Market', 'Tour', 'Other'],
          },
          description: {
            description: 'A brief description of the event',
            type: 'string',
          },
          details: {
            description: 'Specific details like dates, time, and location',
            type: 'object',
            properties: {
              dates: {
                type: 'string',
              },
              time: {
                type: 'string',
              },
              location: {
                type: 'string',
              },
            },
            additionalProperties: false,
          },
          subItems: {
            description: 'A list of sub-points or examples, like different parks for hiking',
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        required: ['title', 'category', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['activities'],
  additionalProperties: false,
};

describe('convertJsonSchemaToFields', () => {
  it('should converts json schema to fields', () => {
    const schema = convertJsonSchemaToFields(JSONSchema);
    expect(schema).toMatchInlineSnapshot(`
      {
        "properties": [
          {
            "description": "The list of activities",
            "items": {
              "properties": [
                {
                  "description": "The main title of the event or activity category",
                  "name": "title",
                  "type": "string",
                },
                {
                  "description": "The type of event",
                  "name": "category",
                  "type": "enum",
                  "values": [
                    "Festival",
                    "Fitness",
                    "Outdoor Activity",
                    "Market",
                    "Tour",
                    "Other",
                  ],
                },
                {
                  "description": "A brief description of the event",
                  "name": "description",
                  "type": "string",
                },
                {
                  "description": "Specific details like dates, time, and location",
                  "name": "details",
                  "properties": [
                    {
                      "name": "dates",
                      "type": "string",
                    },
                    {
                      "name": "time",
                      "type": "string",
                    },
                    {
                      "name": "location",
                      "type": "string",
                    },
                  ],
                  "type": "object",
                },
                {
                  "description": "A list of sub-points or examples, like different parks for hiking",
                  "items": {
                    "type": "string",
                  },
                  "name": "subItems",
                  "type": "array",
                },
              ],
              "type": "object",
            },
            "name": "activities",
            "type": "array",
          },
        ],
        "type": "object",
      }
    `);
  });
});

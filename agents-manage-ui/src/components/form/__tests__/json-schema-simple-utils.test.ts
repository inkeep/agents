import { convertJsonSchemaToSimple, convertSimpleToJsonSchema } from '../json-schema-simple-utils';

const ACTIVITIES_SCHEMA = {
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
} as const;

describe('json-schema-simple-utils', () => {
  it('converts a nested JSON schema into simple format', () => {
    const { simpleSchema, error } = convertJsonSchemaToSimple(ACTIVITIES_SCHEMA);

    expect(error).toBeUndefined();
    expect(simpleSchema.properties).toHaveLength(1);

    const activities = simpleSchema.properties[0];
    expect(activities.name).toBe('activities');
    expect(activities.type).toBe('array');
    expect(activities.required).toBe(true);
    expect(activities.items?.type).toBe('object');

    const activityObject = activities.items;
    expect(activityObject?.properties).toBeDefined();
    expect(activityObject?.properties?.length).toBe(5);

    const titleProperty = activityObject?.properties?.find((prop) => prop.name === 'title');
    expect(titleProperty?.type).toBe('string');
    expect(titleProperty?.required).toBe(true);

    const detailsProperty = activityObject?.properties?.find((prop) => prop.name === 'details');
    expect(detailsProperty?.type).toBe('object');
    expect(detailsProperty?.properties?.length).toBe(3);
  });

  it('round trips the simple schema back into JSON schema', () => {
    const { simpleSchema } = convertJsonSchemaToSimple(ACTIVITIES_SCHEMA);
    const rebuiltSchema = convertSimpleToJsonSchema(simpleSchema);

    expect(rebuiltSchema).not.toBeNull();
    expect(rebuiltSchema).toMatchObject({
      type: 'object',
      required: ['activities'],
      properties: {
        activities: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'category', 'description'],
            properties: {
              title: {
                type: 'string',
              },
              category: {
                type: 'string',
              },
              description: {
                type: 'string',
              },
              details: {
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
              },
              subItems: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    });
  });
});

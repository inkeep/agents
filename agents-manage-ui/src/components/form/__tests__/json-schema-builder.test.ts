const JSONSchema = {
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

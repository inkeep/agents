import { artifactComponent } from '@inkeep/agents-sdk';

export const orderTrackingDisplay = artifactComponent({
  id: 'order-tracking-display',
  name: 'OrderTrackingDisplay',
  description: 'A component that displays order tracking information',
  summaryProps: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      order: {
        description: 'Basic order tracking information for summary view',
        type: 'object',
        properties: {
          id: {
            description: 'The order ID E.g. ORD-2025-101',
            type: 'string',
          },
          status: {
            description: 'Current order status E.g. Delivered',
            type: 'string',
          },
          lastUpdated: {
            description: 'Human readable timestamp E.g. September 29, 2025 at 10:05 PM',
            type: 'string',
          },
        },
        required: ['id', 'status', 'lastUpdated'],
        additionalProperties: false,
      },
    },
    required: ['order'],
    additionalProperties: false,
  },
  fullProps: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      order: {
        description: 'Complete order tracking information for detailed view',
        type: 'object',
        properties: {
          id: {
            description: 'The order ID E.g. ORD-2025-101',
            type: 'string',
          },
          status: {
            description: 'Current order status E.g. Delivered',
            type: 'string',
          },
          latestEvent: {
            description: 'The most recent tracking event',
            type: 'string',
          },
          primaryAddress: {
            description: 'Primary delivery address',
            type: 'string',
          },
          lastUpdated: {
            description: 'Human readable timestamp E.g. September 29, 2025 at 10:05 PM',
            type: 'string',
          },
        },
        required: ['id', 'status', 'latestEvent', 'primaryAddress', 'lastUpdated'],
        additionalProperties: false,
      },
    },
    required: ['order'],
    additionalProperties: false,
  },
});

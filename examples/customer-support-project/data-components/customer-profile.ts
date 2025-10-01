import { dataComponent } from '@inkeep/agents-sdk';

export const customerProfile = dataComponent({
  id: 'customer-profile',
  name: 'CustomerProfile',
  description: 'A component that displays customer profile information including contact details and account status',
  props: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      customer: {
        description: 'The customer profile information',
        type: 'object',
        properties: {
          id: {
            description: 'The unique customer ID',
            type: 'string',
          },
          name: {
            description: 'The customer full name',
            type: 'string',
          },
          email: {
            description: 'The customer email address',
            type: 'string',
          },
          phone: {
            description: 'The customer phone number',
            type: 'string',
          },
          account_status: {
            description: 'The current account status',
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'premium'],
          },
          join_date: {
            description: 'When the customer joined (ISO 8601 format)',
            type: 'string',
          },
          total_orders: {
            description: 'Total number of orders placed',
            type: 'number',
          },
          total_spent: {
            description: 'Total amount spent by the customer',
            type: 'number',
          },
          preferred_language: {
            description: 'Customer preferred language',
            type: 'string',
          },
          timezone: {
            description: 'Customer timezone',
            type: 'string',
          },
        },
        required: ['id', 'name', 'email', 'account_status'],
        additionalProperties: false,
      },
    },
    required: ['customer'],
    additionalProperties: false,
  },
});

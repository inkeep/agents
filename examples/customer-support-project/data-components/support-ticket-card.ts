import { dataComponent } from '@inkeep/agents-sdk';

export const supportTicketCard = dataComponent({
  id: 'support-ticket-card',
  name: 'SupportTicketCard',
  description: 'A card component that displays support ticket information including lists, individual tickets, and closure confirmations for the customer support journey',
  props: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      ticket: {
        description: 'Individual support ticket information',
        type: 'object',
        properties: {
          id: {
            description: 'The unique ticket ID',
            type: 'number',
          },
          subject: {
            description: 'The ticket subject/title',
            type: 'string',
          },
          description: {
            description: 'The ticket description or initial message',
            type: 'string',
          },
          status: {
            description: 'The current status of the ticket',
            type: 'string',
            enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
          },
          priority: {
            description: 'The priority level of the ticket',
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
          },
          created_at: {
            description: 'When the ticket was created (ISO 8601 format)',
            type: 'string',
          },
          updated_at: {
            description: 'When the ticket was last updated (ISO 8601 format)',
            type: 'string',
          },
          requester_email: {
            description: 'Email address of the person who submitted the ticket',
            type: 'string',
          },
          tags: {
            description: 'Tags associated with the ticket',
            type: 'array',
            items: {
              type: 'string',
            },
          },
          order_correlation: {
            description: 'Related order information extracted from ticket subject/description',
            type: 'object',
            properties: {
              order_id: {
                description: 'Order ID found in ticket (e.g., ORD-2024-001)',
                type: 'string',
              },
              order_status: {
                description: 'Current status of the related order',
                type: 'string',
                enum: ['Created', 'InTransit', 'OutForDelivery', 'Delivered'],
              },
            },
            additionalProperties: false,
          },
        },
        required: ['id', 'subject', 'status', 'priority', 'created_at', 'requester_email'],
        additionalProperties: false,
      },
      ticketsList: {
        description: 'List of tickets for getTicketsByEmail results (Step 2 of user journey)',
        type: 'object',
        properties: {
          customer_email: {
            description: 'Customer email used for the search',
            type: 'string',
          },
          total_count: {
            description: 'Total number of tickets found',
            type: 'number',
          },
          tickets: {
            description: 'Array of ticket objects',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  description: 'Ticket ID',
                  type: 'number',
                },
                subject: {
                  description: 'Ticket subject',
                  type: 'string',
                },
                status: {
                  description: 'Ticket status',
                  type: 'string',
                  enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
                },
                priority: {
                  description: 'Ticket priority',
                  type: 'string',
                  enum: ['low', 'normal', 'high', 'urgent'],
                },
                created_at: {
                  description: 'Creation timestamp',
                  type: 'string',
                },
                updated_at: {
                  description: 'Last update timestamp',
                  type: 'string',
                },
                order_correlation: {
                  description: 'Related order information if found',
                  type: 'object',
                  properties: {
                    order_id: {
                      type: 'string',
                    },
                    order_status: {
                      type: 'string',
                      enum: ['Created', 'InTransit', 'OutForDelivery', 'Delivered'],
                    },
                  },
                  additionalProperties: false,
                },
              },
              required: ['id', 'subject', 'status', 'priority', 'created_at'],
              additionalProperties: false,
            },
          },
        },
        required: ['customer_email', 'total_count', 'tickets'],
        additionalProperties: false,
      },
      ticketClosure: {
        description: 'Ticket closure confirmation (Step 6 of user journey)',
        type: 'object',
        properties: {
          ticket_id: {
            description: 'ID of the closed ticket',
            type: 'number',
          },
          status: {
            description: 'New status (should be "closed")',
            type: 'string',
            enum: ['closed'],
          },
          closed_at: {
            description: 'Timestamp when ticket was closed (ISO 8601 format)',
            type: 'string',
          },
          closure_reason: {
            description: 'Reason for closure (e.g., "Delivery confirmed")',
            type: 'string',
          },
          related_order_id: {
            description: 'Order ID that triggered the closure',
            type: 'string',
          },
          message: {
            description: 'Success message to display (e.g., "Thanks! I\'ve marked your ticket as resolved.")',
            type: 'string',
          },
        },
        required: ['ticket_id', 'status', 'closed_at', 'message'],
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
});

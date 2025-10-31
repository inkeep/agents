import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const zendeskTicketCard = dataComponent({
  id: 'ticketcard-data',
  name: 'ZendeskTicketCard',
  description: 'Zendesk ticket card data',
  props: z.object({
    ticket_id: z.string().describe('Ticket identifier'),
    ticket_subject: z.string().describe('Ticket subject'),
    ticket_status: z.string().describe('Ticket status'),
    ticket_priority: z.string().describe('Ticket priority'),
    ticket_created: z.string().describe('Ticket creation date'),
    ticket_url: z.string().describe('Ticket URL'),
  }),
});
import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const ticketSummary = artifactComponent({
  id: 'ticket-summary',
  name: 'Ticket Summary',
  props: z.object({
      title: z.string(),
    })
});

import { project } from '@inkeep/agents-sdk';
import { orderTrackingDisplay } from './artifacts/order-tracking-display';
import { customerProfile } from './data-components/customer-profile';
import { supportTicketCard } from './data-components/support-ticket-card';
import { customerSupportGraph } from './graphs/customer-support-graph';
import { orderTrackingMcp } from './tools/order-tracking-mcp';
import { zendeskMcp } from './tools/zendesk-mcp';

export const customerSupportProject = project({
  id: 'customer-support-project',
  name: 'Customer Support Demo',
  description:
    'Comprehensive customer support system demonstrating AI-powered support with Zendesk integration, order tracking, and rich UI components. Features authenticated customer interactions, live ticket management, and delivery confirmations.',
  models: {
    base: { model: 'openai/gpt-4.1-mini-2025-04-14' },
  },
  graphs: () => [customerSupportGraph],
  tools: () => [zendeskMcp, orderTrackingMcp],
  dataComponents: () => [supportTicketCard, customerProfile],
  artifactComponents: () => [orderTrackingDisplay],
});

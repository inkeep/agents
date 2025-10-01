import { registerEnvironmentSettings } from '@inkeep/agents-sdk';

export const development = registerEnvironmentSettings({
  credentials: {
    // Zendesk API credentials would go here in a real implementation
    // ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN,
    // ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN,
    // ZENDESK_EMAIL: process.env.ZENDESK_EMAIL,
    
    // Order tracking service credentials (mock)
    // ORDER_TRACKING_API_KEY: process.env.ORDER_TRACKING_API_KEY,
  }
});

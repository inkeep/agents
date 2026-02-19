import { Trigger } from '@inkeep/agents-sdk';

export const githubWebhook = new Trigger({
  id: 'github-webhook',
  name: 'GitHub Webhook',
  messageTemplate: 'New webhook event'
});


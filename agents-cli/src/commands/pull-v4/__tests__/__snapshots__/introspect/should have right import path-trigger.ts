import { Trigger } from '@inkeep/agents-sdk';
import { ghSignatureSecretCredential } from '../../credentials/gh-signature-secret';

export const signedGithubWebhookTrigger = new Trigger({
  id: 'vhfn9x24dbqzvokv1g6wm',
  name: 'Signed GitHub Webhook',
  enabled: true,
  signingSecretCredentialReference: ghSignatureSecretCredential,
});

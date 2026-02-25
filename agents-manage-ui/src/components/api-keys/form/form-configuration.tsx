import type { ApiKeyInput } from './validation';

export const defaultValues: ApiKeyInput = {
  name: '',
  agentId: '',
  expiresAt: 'never',
};

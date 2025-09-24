import type { ApiKeyFormData } from './validation';

export const defaultValues: ApiKeyFormData = {
  name: '',
  graphId: '',
  expiresAt: 'never',
};

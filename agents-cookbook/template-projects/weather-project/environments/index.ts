import { createEnvironmentSettings } from '@inkeep/agents-sdk';
import { development } from './development.env';

export const envSettings = createEnvironmentSettings({
  development,
});

import { registerEnvironmentSettings } from '@inkeep/agents-sdk';
import { inkeepApiKey } from '../credentials/inkeep-api-key';

export const development = registerEnvironmentSettings({
  credentials: {
    inkeepApiKey: inkeepApiKey,
  },
});

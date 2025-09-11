import type { Models } from '@inkeep/agents-core';

export interface InkeepConfig {
  tenantId: string;
  projectId: string;
  agentsManageApiUrl: string;
  agentsRunApiUrl: string;
  manageUiUrl?: string;
  outputDirectory?: string;
  modelSettings?: Models;
}

export function defineConfig(config: InkeepConfig): InkeepConfig {
  return config;
}

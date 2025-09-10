import type { ModelSettings } from '@inkeep/agents-core';

export interface InkeepConfig {
  tenantId: string;
  projectId: string;
  agentsManageApiUrl: string;
  agentsRunApiUrl: string;
  manageUiUrl?: string;
  outputDirectory?: string;
  modelSettings?: ModelSettings;
}

export function defineConfig(config: InkeepConfig): InkeepConfig {
  return config;
}

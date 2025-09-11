import type { ProjectModels } from '@inkeep/agents-core';

export interface InkeepConfig {
  tenantId: string;
  projectId: string;
  agentsManageApiUrl: string;
  agentsRunApiUrl: string;
  manageUiUrl?: string;
  outputDirectory?: string;
  modelSettings?: ProjectModels;
}

export function defineConfig(config: InkeepConfig): InkeepConfig {
  return config;
}

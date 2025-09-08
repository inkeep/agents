import type { ModelSettings } from '@inkeep/agents-core';

export interface InkeepConfig {
  tenantId: string;
  projectId: string;
  managementApiUrl: string;
  executionApiUrl: string;
  outputDirectory?: string;
  modelSettings?: ModelSettings;
}

export function defineConfig(config: InkeepConfig): InkeepConfig {
  return config;
}

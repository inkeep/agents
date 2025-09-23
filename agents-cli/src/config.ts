
export interface InkeepConfig {
  tenantId: string;
  agentsManageApiUrl: string;
  agentsRunApiUrl: string;
  manageUiUrl?: string;
  outputDirectory?: string;
}

export function defineConfig(config: InkeepConfig): InkeepConfig {
  return config;
}

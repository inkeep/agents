// Nested API configuration format (new)
export interface ApiConfig {
  url: string;
  apiKey?: string;
}

// Flat configuration format (legacy, for backward compatibility)
export interface FlatInkeepConfig {
  tenantId: string;
  /**
   * @deprecated Use the nested `agentsManageApi.url` format instead
   */
  agentsManageApiUrl: string;
  /**
   * @deprecated Use the nested `agentsRunApi.url` format instead
   */
  agentsRunApiUrl: string;
  manageUiUrl?: string;
  outputDirectory?: string;
}

// Nested configuration format (new)
export interface NestedInkeepConfig {
  tenantId: string;
  agentsManageApi: ApiConfig;
  agentsRunApi: ApiConfig;
  manageUiUrl?: string;
  outputDirectory?: string;
}

// Union type supporting both formats
export type InkeepConfig = FlatInkeepConfig | NestedInkeepConfig;

export function defineConfig(config: InkeepConfig): InkeepConfig {
  return config;
}

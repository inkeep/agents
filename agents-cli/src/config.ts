// Nested API configuration format (new)
export interface ApiConfig {
  /**
   * API endpoint URL
   */
  url: string;
  /**
   * API key
   */
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
  /**
   * Tenant identifier
   */
  tenantId: string;
  /**
   * Management API configuration
   * @default http://localhost:3002
   */
  agentsManageApi: ApiConfig;
  /**
   * Runtime API configuration
   * @default http://localhost:3002
   */
  agentsRunApi: ApiConfig;
  /**
   * Management UI URL
   * @default http://localhost:3000
   */
  manageUiUrl?: string;
  /**
   * Output directory for generated files
   */
  outputDirectory?: string;
}

// Union type supporting both formats
export type InkeepConfig = FlatInkeepConfig | NestedInkeepConfig;

export function defineConfig(config: InkeepConfig): InkeepConfig {
  return config;
}

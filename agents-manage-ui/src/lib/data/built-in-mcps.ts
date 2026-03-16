import {
  BUILT_IN_MCP_CONFIGS,
  BUILT_IN_MCP_URL_PREFIX,
  INKEEP_ICON_IMAGE_URL,
  INKEEP_SEARCH_MCPS,
} from '@inkeep/agents-core/client-exports';

export { BUILT_IN_MCP_URL_PREFIX, INKEEP_ICON_IMAGE_URL };

export const BUILT_IN_MCPS = [...BUILT_IN_MCP_CONFIGS].filter(
  (mcp) => !INKEEP_SEARCH_MCPS.some((s) => s.id === mcp.id)
);

export const WEB_SEARCH_PROVIDERS = [...INKEEP_SEARCH_MCPS];

import type { McpTool, ToolSelect } from '../types/entities';

export const BUILT_IN_MCP_URL_PREFIX = 'inkeepBuiltIn:';

export const INKEEP_ICON_IMAGE_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjUyIiBoZWlnaHQ9IjI1MiIgdmlld0JveD0iMCAwIDI1MiAyNTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01My4xMjk2IDU0LjgzMTVDNDkuOTE0MyA1NC44MzE1IDQ2Ljk0MzEgNTYuNTQ2OSA0NS4zMzU0IDU5LjMzMTVMOS40Mzc3NiAxMjEuNTA4QzcuODMwMDcgMTI0LjI5MyA3LjgzMDA3IDEyNy43MjQgOS40Mzc3NyAxMzAuNTA4TDQ1LjMzNTQgMTkyLjY4NUM0Ni45NDMxIDE5NS40NjkgNDkuOTE0MyAxOTcuMTg1IDUzLjEyOTYgMTk3LjE4NUgxMjQuOTI1QzEyOC4xNCAxOTcuMTg1IDEzMS4xMTIgMTk1LjQ2OSAxMzIuNzE5IDE5Mi42ODVMMTY4LjYxNyAxMzAuNTA4QzE3MC4yMjUgMTI3LjcyNCAxNzAuMjI1IDEyNC4yOTMgMTY4LjYxNyAxMjEuNTA4TDEzMi43MTkgNTkuMzMxNUMxMzEuMTEyIDU2LjU0NjkgMTI4LjE0IDU0LjgzMTUgMTI0LjkyNSA1NC44MzE1SDUzLjEyOTZaIiBzdHJva2U9IiMzNzg0RkYiIHN0cm9rZS13aWR0aD0iMTAiLz4KPHBhdGggZD0iTTE5OS41NzEgNTMuNDgxMkMyMjEuMDkgNTkuMDE4NyAyMTguNjM4IDcxLjIzMDggMjI3LjU2MiA5Ni4wNzA4QzIzMy4yODggMTEyLjAwNyAyNjAuOTY5IDEzMS43NjggMjM1LjY3MyAxNzAuMTgxQzIyOC4xMjQgMTgxLjY0NCAyMDMuODQ5IDE5NS4yNDUgMTg2LjI4NSAxOTkuMDE4QzE0Ny41ODkgMjA3LjIwMSAxMjQuNzg4IDE4OC42MyAxMDQuNTYxIDE1OC4wMTFDODkuMzg1OCAxMzQuODUxIDk0Ljc0OCAxMDEuNTA4IDExNy43NjUgODUuMTM1M0MxMzkuNTc4IDY5LjY2MTQgMTcxLjI4MyA0NS42NTAzIDE5OS41NzEgNTMuNDgxMloiIHN0cm9rZT0iIzM3ODRGRiIgc3Ryb2tlLXdpZHRoPSI5LjgiLz4KPC9zdmc+Cg==';

export const INKEEP_MEDIA_MCP = {
  id: 'inkeep-media',
  name: 'Media Processing',
  version: '1.0.0',
  description: 'Image processing tools powered by Sharp',
  urlPath: '/inkeep-media/mcp',
  imageUrl: INKEEP_ICON_IMAGE_URL,
  tools: ['image_info', 'image_crop', 'image_resize'],
} as const;

const SEARCH_MCP_BASE = {
  version: '1.0.0' as const,
  tools: ['web_search'] as const,
  imageUrl: INKEEP_ICON_IMAGE_URL,
};

export const INKEEP_SEARCH_EXA_MCP = {
  ...SEARCH_MCP_BASE,
  id: 'inkeep-search-exa',
  name: 'Exa',
  description: 'Web search powered by Exa',
  urlPath: '/inkeep-search/exa/mcp',
  requiresCredential: true as const,
} as const;

export const INKEEP_SEARCH_TAVILY_MCP = {
  ...SEARCH_MCP_BASE,
  id: 'inkeep-search-tavily',
  name: 'Tavily',
  description: 'Web search powered by Tavily',
  urlPath: '/inkeep-search/tavily/mcp',
  requiresCredential: true as const,
} as const;

export const INKEEP_SEARCH_BRAVE_MCP = {
  ...SEARCH_MCP_BASE,
  id: 'inkeep-search-brave',
  name: 'Brave Search',
  description: 'Web search powered by Brave',
  urlPath: '/inkeep-search/brave/mcp',
  requiresCredential: true as const,
} as const;

export const INKEEP_SEARCH_SERPAPI_MCP = {
  ...SEARCH_MCP_BASE,
  id: 'inkeep-search-serpapi',
  name: 'SerpAPI',
  description: 'Web search powered by SerpAPI',
  urlPath: '/inkeep-search/serpapi/mcp',
  requiresCredential: true as const,
} as const;

export const INKEEP_SEARCH_MCPS = [
  INKEEP_SEARCH_EXA_MCP,
  INKEEP_SEARCH_TAVILY_MCP,
  INKEEP_SEARCH_BRAVE_MCP,
  INKEEP_SEARCH_SERPAPI_MCP,
] as const;

export type BuiltInMcpId =
  | (typeof INKEEP_MEDIA_MCP)['id']
  | (typeof INKEEP_SEARCH_MCPS)[number]['id'];

export const BUILT_IN_MCP_CONFIGS = [INKEEP_MEDIA_MCP, ...INKEEP_SEARCH_MCPS] as const;

export const isBuiltInMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.startsWith(BUILT_IN_MCP_URL_PREFIX);

const getBuiltInMcpConfigId = (tool: ToolSelect | McpTool): string | null => {
  if (!isBuiltInMcp(tool)) return null;
  return tool.config.mcp.server.url.slice(BUILT_IN_MCP_URL_PREFIX.length) || null;
};

export const isInkeepMediaMcp = (tool: ToolSelect | McpTool) =>
  getBuiltInMcpConfigId(tool) === INKEEP_MEDIA_MCP.id;

export const isInkeepSearchMcp = (tool: ToolSelect | McpTool) =>
  getBuiltInMcpConfigId(tool)?.startsWith('inkeep-search-') ?? false;

export const resolveBuiltInMcpUrl = (
  tool: ToolSelect | McpTool,
  baseUrl: string
): string | null => {
  const configId = getBuiltInMcpConfigId(tool);
  if (!configId) return null;
  const builtInConfig = BUILT_IN_MCP_CONFIGS.find((config) => config.id === configId);
  if (!builtInConfig) {
    console.warn(
      `[built-in-mcps] Unknown built-in MCP config ID "${configId}" — no matching entry in BUILT_IN_MCP_CONFIGS`
    );
    return null;
  }
  return `${baseUrl}${builtInConfig.urlPath}`;
};

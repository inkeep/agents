import type { McpTool, ToolSelect } from '../types/entities';

export const BUILT_IN_MCP_URL_PREFIX = 'inkeepBuiltIn:';

const INKEEP_ICON_IMAGE_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjUyIiBoZWlnaHQ9IjI1MiIgdmlld0JveD0iMCAwIDI1MiAyNTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01My4xMjk2IDU0LjgzMTVDNDkuOTE0MyA1NC44MzE1IDQ2Ljk0MzEgNTYuNTQ2OSA0NS4zMzU0IDU5LjMzMTVMOS40Mzc3NiAxMjEuNTA4QzcuODMwMDcgMTI0LjI5MyA3LjgzMDA3IDEyNy43MjQgOS40Mzc3NyAxMzAuNTA4TDQ1LjMzNTQgMTkyLjY4NUM0Ni45NDMxIDE5NS40NjkgNDkuOTE0MyAxOTcuMTg1IDUzLjEyOTYgMTk3LjE4NUgxMjQuOTI1QzEyOC4xNCAxOTcuMTg1IDEzMS4xMTIgMTk1LjQ2OSAxMzIuNzE5IDE5Mi42ODVMMTY4LjYxNyAxMzAuNTA4QzE3MC4yMjUgMTI3LjcyNCAxNzAuMjI1IDEyNC4yOTMgMTY4LjYxNyAxMjEuNTA4TDEzMi43MTkgNTkuMzMxNUMxMzEuMTEyIDU2LjU0NjkgMTI4LjE0IDU0LjgzMTUgMTI0LjkyNSA1NC44MzE1SDUzLjEyOTZaIiBzdHJva2U9IiMzNzg0RkYiIHN0cm9rZS13aWR0aD0iMTAiLz4KPHBhdGggZD0iTTE5OS41NzEgNTMuNDgxMkMyMjEuMDkgNTkuMDE4NyAyMTguNjM4IDcxLjIzMDggMjI3LjU2MiA5Ni4wNzA4QzIzMy4yODggMTEyLjAwNyAyNjAuOTY5IDEzMS43NjggMjM1LjY3MyAxNzAuMTgxQzIyOC4xMjQgMTgxLjY0NCAyMDMuODQ5IDE5NS4yNDUgMTg2LjI4NSAxOTkuMDE4QzE0Ny41ODkgMjA3LjIwMSAxMjQuNzg4IDE4OC42MyAxMDQuNTYxIDE1OC4wMTFDODkuMzg1OCAxMzQuODUxIDk0Ljc0OCAxMDEuNTA4IDExNy43NjUgODUuMTM1M0MxMzkuNTc4IDY5LjY2MTQgMTcxLjI4MyA0NS42NTAzIDE5OS41NzEgNTMuNDgxMloiIHN0cm9rZT0iIzM3ODRGRiIgc3Ryb2tlLXdpZHRoPSI5LjgiLz4KPC9zdmc+Cg==';

export const INKEEP_COREUTILS_MCP = {
  id: 'inkeep-coreutils',
  name: 'inkeep-coreutils',
  version: '1.0.0',
  description: 'Core text and data tools: grep, sed, diff, patch, head, JSON, encoding, HTML, and utility',
  urlPath: '/inkeep-coreutils/mcp',
  imageUrl: INKEEP_ICON_IMAGE_URL,
  tools: [
    'grep',
    'sed',
    'diff',
    'patch',
    'head',
    'tail',
    'json_format',
    'json_query',
    'json_merge',
    'json_diff',
    'base64_encode',
    'base64_decode',
    'hash',
    'url_encode',
    'url_decode',
    'html_to_markdown',
    'calculate',
    'uuid',
    'timestamp',
  ],
} as const;

export const INKEEP_HTTP_MCP = {
  id: 'inkeep-http',
  name: 'inkeep-http',
  version: '1.0.0',
  description: 'Outbound HTTP requests via curl',
  urlPath: '/inkeep-http/mcp',
  imageUrl: INKEEP_ICON_IMAGE_URL,
  tools: ['curl'],
} as const;

export const INKEEP_MEDIA_MCP = {
  id: 'inkeep-media',
  name: 'inkeep-media',
  version: '1.0.0',
  description: 'Image processing tools powered by Sharp',
  urlPath: '/inkeep-media/mcp',
  imageUrl: INKEEP_ICON_IMAGE_URL,
  tools: ['image_info', 'image_crop', 'image_resize'],
} as const;

export const INKEEP_SEARCH_MCP = {
  id: 'inkeep-search',
  name: 'inkeep-search',
  version: '1.0.0',
  description: 'Web search tools powered by Exa',
  urlPath: '/inkeep-search/mcp',
  imageUrl: INKEEP_ICON_IMAGE_URL,
  tools: ['web_search', 'find_similar'],
} as const;

export type BuiltInMcpId =
  | (typeof INKEEP_COREUTILS_MCP)['id']
  | (typeof INKEEP_HTTP_MCP)['id']
  | (typeof INKEEP_MEDIA_MCP)['id']
  | (typeof INKEEP_SEARCH_MCP)['id'];

export const BUILT_IN_MCP_CONFIGS = [
  INKEEP_COREUTILS_MCP,
  INKEEP_HTTP_MCP,
  INKEEP_MEDIA_MCP,
  INKEEP_SEARCH_MCP,
] as const;

export const isBuiltInMcp = (tool: ToolSelect | McpTool) =>
  tool.config.type === 'mcp' && tool.config.mcp.server.url.startsWith(BUILT_IN_MCP_URL_PREFIX);

const getBuiltInMcpConfigId = (tool: ToolSelect | McpTool): string | null => {
  if (!isBuiltInMcp(tool)) return null;
  return tool.config.mcp.server.url.slice(BUILT_IN_MCP_URL_PREFIX.length) || null;
};

export const isInkeepCoreutilsMcp = (tool: ToolSelect | McpTool) =>
  getBuiltInMcpConfigId(tool) === INKEEP_COREUTILS_MCP.id;

export const isInkeepHttpMcp = (tool: ToolSelect | McpTool) =>
  getBuiltInMcpConfigId(tool) === INKEEP_HTTP_MCP.id;

export const isInkeepMediaMcp = (tool: ToolSelect | McpTool) =>
  getBuiltInMcpConfigId(tool) === INKEEP_MEDIA_MCP.id;

export const isInkeepSearchMcp = (tool: ToolSelect | McpTool) =>
  getBuiltInMcpConfigId(tool) === INKEEP_SEARCH_MCP.id;

export const resolveBuiltInMcpUrl = (tool: ToolSelect | McpTool, baseUrl: string): string | null => {
  const configId = getBuiltInMcpConfigId(tool);
  if (!configId) return null;
  const builtInConfig = BUILT_IN_MCP_CONFIGS.find((config) => config.id === configId);
  return builtInConfig ? `${baseUrl}${builtInConfig.urlPath}` : null;
};

import {
  BUILT_IN_MCP_URL_PREFIX,
  INKEEP_COREUTILS_MCP,
  INKEEP_HTTP_MCP,
  INKEEP_MEDIA_MCP,
  INKEEP_SEARCH_BRAVE_MCP,
  INKEEP_SEARCH_EXA_MCP,
  INKEEP_SEARCH_SERPAPI_MCP,
  INKEEP_SEARCH_TAVILY_MCP,
} from '@inkeep/agents-core';
import { mcpServer } from './builderFunctions';
import type { Tool } from './tool';

export const INKEEP_COREUTILS: Tool = mcpServer({
  id: INKEEP_COREUTILS_MCP.id,
  name: INKEEP_COREUTILS_MCP.name,
  description: INKEEP_COREUTILS_MCP.description,
  imageUrl: INKEEP_COREUTILS_MCP.imageUrl,
  serverUrl: `${BUILT_IN_MCP_URL_PREFIX}${INKEEP_COREUTILS_MCP.id}`,
});

export const INKEEP_COREUTILS_TOOLS = {
  TEXT_SEARCH: 'text_search',
  TEXT_REPLACE: 'text_replace',
  TEXT_SLICE: 'text_slice',
  TEXT_DIFF: 'text_diff',
  TEXT_PATCH: 'text_patch',
  TEXT_WINDOW: 'text_window',
  JSON_FORMAT: 'json_format',
  JSON_QUERY: 'json_query',
  JSON_MERGE: 'json_merge',
  JSON_DIFF: 'json_diff',
  BASE64_ENCODE: 'base64_encode',
  BASE64_DECODE: 'base64_decode',
  HASH: 'hash',
  URL_ENCODE: 'url_encode',
  URL_DECODE: 'url_decode',
  HTML_TO_MARKDOWN: 'html_to_markdown',
  CALCULATE: 'calculate',
  UUID: 'uuid',
  TIMESTAMP: 'timestamp',
} as const;

export const INKEEP_HTTP: Tool = mcpServer({
  id: INKEEP_HTTP_MCP.id,
  name: INKEEP_HTTP_MCP.name,
  description: INKEEP_HTTP_MCP.description,
  imageUrl: INKEEP_HTTP_MCP.imageUrl,
  serverUrl: `${BUILT_IN_MCP_URL_PREFIX}${INKEEP_HTTP_MCP.id}`,
});

export const INKEEP_HTTP_TOOLS = {
  CURL: 'curl',
} as const;

export const INKEEP_MEDIA: Tool = mcpServer({
  id: INKEEP_MEDIA_MCP.id,
  name: INKEEP_MEDIA_MCP.name,
  description: INKEEP_MEDIA_MCP.description,
  imageUrl: INKEEP_MEDIA_MCP.imageUrl,
  serverUrl: `${BUILT_IN_MCP_URL_PREFIX}${INKEEP_MEDIA_MCP.id}`,
});

export const INKEEP_MEDIA_TOOLS = {
  IMAGE_INFO: 'image_info',
  IMAGE_CROP: 'image_crop',
  IMAGE_RESIZE: 'image_resize',
} as const;

const makeSearchTool = (mcp: {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
}): Tool =>
  mcpServer({
    id: mcp.id,
    name: mcp.name,
    description: mcp.description,
    imageUrl: mcp.imageUrl,
    serverUrl: `${BUILT_IN_MCP_URL_PREFIX}${mcp.id}`,
  });

export const INKEEP_SEARCH: Record<'EXA' | 'TAVILY' | 'BRAVE' | 'SERPAPI', Tool> = {
  EXA: makeSearchTool(INKEEP_SEARCH_EXA_MCP),
  TAVILY: makeSearchTool(INKEEP_SEARCH_TAVILY_MCP),
  BRAVE: makeSearchTool(INKEEP_SEARCH_BRAVE_MCP),
  SERPAPI: makeSearchTool(INKEEP_SEARCH_SERPAPI_MCP),
};

export const INKEEP_SEARCH_TOOLS = {
  WEB_SEARCH: 'web_search',
} as const;

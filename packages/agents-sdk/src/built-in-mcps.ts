import {
  BUILT_IN_MCP_URL_PREFIX,
  INKEEP_MEDIA_MCP,
  INKEEP_SEARCH_BRAVE_MCP,
  INKEEP_SEARCH_EXA_MCP,
  INKEEP_SEARCH_SERPAPI_MCP,
  INKEEP_SEARCH_TAVILY_MCP,
} from '@inkeep/agents-core';
import { mcpServer } from './builderFunctions';
import type { Tool } from './tool';

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

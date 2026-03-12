import {
  BUILT_IN_MCP_URL_PREFIX,
  INKEEP_COREUTILS_MCP,
  INKEEP_HTTP_MCP,
  INKEEP_MEDIA_MCP,
  INKEEP_SEARCH_MCP,
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

export const INKEEP_HTTP: Tool = mcpServer({
  id: INKEEP_HTTP_MCP.id,
  name: INKEEP_HTTP_MCP.name,
  description: INKEEP_HTTP_MCP.description,
  imageUrl: INKEEP_HTTP_MCP.imageUrl,
  serverUrl: `${BUILT_IN_MCP_URL_PREFIX}${INKEEP_HTTP_MCP.id}`,
});

export const INKEEP_MEDIA: Tool = mcpServer({
  id: INKEEP_MEDIA_MCP.id,
  name: INKEEP_MEDIA_MCP.name,
  description: INKEEP_MEDIA_MCP.description,
  imageUrl: INKEEP_MEDIA_MCP.imageUrl,
  serverUrl: `${BUILT_IN_MCP_URL_PREFIX}${INKEEP_MEDIA_MCP.id}`,
});

export const INKEEP_SEARCH: Tool = mcpServer({
  id: INKEEP_SEARCH_MCP.id,
  name: INKEEP_SEARCH_MCP.name,
  description: INKEEP_SEARCH_MCP.description,
  imageUrl: INKEEP_SEARCH_MCP.imageUrl,
  serverUrl: `${BUILT_IN_MCP_URL_PREFIX}${INKEEP_SEARCH_MCP.id}`,
});

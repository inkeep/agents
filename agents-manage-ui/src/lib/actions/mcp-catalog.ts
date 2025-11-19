'use server';

import { fetchMCPCatalog } from '../api/mcp-catalog';
import type { PrebuiltMCPServer } from '../data/prebuilt-mcp-servers';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Fetch full MCP catalog (includes both static servers and Composio servers if configured)
 */
export async function fetchMCPCatalogAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<PrebuiltMCPServer[]>> {
  try {
    const result = await fetchMCPCatalog(tenantId, projectId);
    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch MCP catalog',
      code: 'unknown_error',
    };
  }
}

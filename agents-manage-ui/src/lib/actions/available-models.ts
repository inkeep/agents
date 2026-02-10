'use server';

import type { AvailableModelsResponse, ModelType } from '@inkeep/agents-core';
import { fetchAvailableModels } from '../api/available-models';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function getAvailableModelsAction(
  tenantId: string,
  type: ModelType = 'chat'
): Promise<ActionResult<AvailableModelsResponse>> {
  try {
    const result = await fetchAvailableModels(tenantId, type);
    return {
      success: true,
      data: result,
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
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

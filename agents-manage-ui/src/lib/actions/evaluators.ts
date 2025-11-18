'use server';

import { revalidatePath } from 'next/cache';
import {
  createEvaluator,
  deleteEvaluator,
  type Evaluator,
  type EvaluatorInsert,
  type EvaluatorUpdate,
  fetchEvaluators,
  updateEvaluator,
} from '../api/evaluators';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Fetch all evaluators
 */
export async function fetchEvaluatorsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Evaluator[]>> {
  try {
    const result = await fetchEvaluators(tenantId, projectId);
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
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

/**
 * Create a new evaluator
 */
export async function createEvaluatorAction(
  tenantId: string,
  projectId: string,
  evaluatorData: EvaluatorInsert
): Promise<ActionResult<Evaluator>> {
  try {
    const evaluator = await createEvaluator(tenantId, projectId, evaluatorData);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return {
      success: true,
      data: evaluator,
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

/**
 * Update an existing evaluator
 */
export async function updateEvaluatorAction(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  evaluatorData: EvaluatorUpdate
): Promise<ActionResult<Evaluator>> {
  try {
    const evaluator = await updateEvaluator(tenantId, projectId, evaluatorId, evaluatorData);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return {
      success: true,
      data: evaluator,
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

/**
 * Delete an evaluator
 */
export async function deleteEvaluatorAction(
  tenantId: string,
  projectId: string,
  evaluatorId: string
): Promise<ActionResult<void>> {
  try {
    await deleteEvaluator(tenantId, projectId, evaluatorId);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return {
      success: true,
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

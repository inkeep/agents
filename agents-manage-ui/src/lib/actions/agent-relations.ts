'use server';

import { revalidatePath } from 'next/cache';
import type { AgentRelation } from '../api/agent-relations';
import {
  addDatasetAgent,
  addEvaluatorAgent,
  fetchDatasetAgents,
  fetchEvaluatorAgents,
  removeDatasetAgent,
  removeEvaluatorAgent,
} from '../api/agent-relations';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function fetchDatasetAgentsAction(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ActionResult<AgentRelation[]>> {
  try {
    const data = await fetchDatasetAgents(tenantId, projectId, datasetId);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function addDatasetAgentAction(
  tenantId: string,
  projectId: string,
  datasetId: string,
  agentId: string
): Promise<ActionResult<AgentRelation>> {
  try {
    const data = await addDatasetAgent(tenantId, projectId, datasetId, agentId);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${datasetId}`);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function removeDatasetAgentAction(
  tenantId: string,
  projectId: string,
  datasetId: string,
  agentId: string
): Promise<ActionResult<void>> {
  try {
    await removeDatasetAgent(tenantId, projectId, datasetId, agentId);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${datasetId}`);
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function fetchEvaluatorAgentsAction(
  tenantId: string,
  projectId: string,
  evaluatorId: string
): Promise<ActionResult<AgentRelation[]>> {
  try {
    const data = await fetchEvaluatorAgents(tenantId, projectId, evaluatorId);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function addEvaluatorAgentAction(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  agentId: string
): Promise<ActionResult<AgentRelation>> {
  try {
    const data = await addEvaluatorAgent(tenantId, projectId, evaluatorId, agentId);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function removeEvaluatorAgentAction(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  agentId: string
): Promise<ActionResult<void>> {
  try {
    await removeEvaluatorAgent(tenantId, projectId, evaluatorId, agentId);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

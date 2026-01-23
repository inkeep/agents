'use server';

import type { SkillApiInsert, SkillApiUpdate } from '@inkeep/agents-core';
import { revalidatePath } from 'next/cache';
import { cache } from 'react';
import {
  createSkill,
  deleteSkill,
  fetchSkill,
  fetchSkills,
  type Skill,
  updateSkill,
} from '@/lib/api/skills';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function fetchSkillsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Skill[]>> {
  try {
    const data = await fetchSkills(tenantId, projectId);
    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch agent skills',
    };
  }
}

async function $fetchSkillAction(
  tenantId: string,
  projectId: string,
  skillId: string
): Promise<ActionResult<Skill>> {
  try {
    const data = await fetchSkill(tenantId, projectId, skillId);
    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch agent skill',
    };
  }
}
export const fetchSkillAction = cache($fetchSkillAction);

export async function createSkillAction(
  tenantId: string,
  projectId: string,
  skill: SkillApiInsert
): Promise<ActionResult<Skill>> {
  try {
    const data = await createSkill(tenantId, projectId, skill);

    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create agent skill',
    };
  }
}

export async function updateSkillAction(
  tenantId: string,
  projectId: string,
  skillId: string,
  skill: SkillApiUpdate
): Promise<ActionResult<Skill>> {
  try {
    const data = await updateSkill(tenantId, projectId, skillId, skill);

    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update skill',
    };
  }
}

export async function deleteSkillAction(
  tenantId: string,
  projectId: string,
  skillId: string
): Promise<ActionResult<null>> {
  try {
    await deleteSkill(tenantId, projectId, skillId);
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete skill',
    };
  }
}

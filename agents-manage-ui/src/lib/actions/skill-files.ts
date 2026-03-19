'use server';

import { parseSkillFromMarkdown, SkillFrontmatterSchema } from '@inkeep/agents-core';
import { revalidatePath } from 'next/cache';
import { fetchSkill, updateSkill } from '@/lib/api/skills';
import { buildSkillFileViewHref, SKILL_ENTRY_FILE_PATH } from '@/lib/utils/skill-files';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

function revalidateSkillFilePaths(
  tenantId: string,
  projectId: string,
  skillId: string,
  filePath: string
) {
  const skillsPath = `/${tenantId}/projects/${projectId}/skills`;
  revalidatePath(skillsPath);
  revalidatePath(buildSkillFileViewHref(tenantId, projectId, skillId, filePath));
  revalidatePath(buildSkillFileViewHref(tenantId, projectId, skillId, SKILL_ENTRY_FILE_PATH));
}
// TODO remove all validation, whcih are done in backend
export async function updateSkillFileAction(
  tenantId: string,
  projectId: string,
  skillId: string,
  filePath: string,
  content: string
): Promise<ActionResult<null>> {
  try {
    const skill = await fetchSkill(tenantId, projectId, skillId);
    const files = skill.files.map((file) =>
      file.filePath === filePath ? { filePath: file.filePath, content } : file
    );

    if (!files.some((file) => file.filePath === filePath)) {
      return {
        success: false,
        error: 'Skill file not found',
        code: 'not_found',
      };
    }

    if (filePath === SKILL_ENTRY_FILE_PATH) {
      const parsed = parseSkillFromMarkdown(content);
      const frontmatterResult = SkillFrontmatterSchema.safeParse(parsed.frontmatter);

      if (!frontmatterResult.success) {
        return {
          success: false,
          error: frontmatterResult.error.issues[0]?.message ?? 'Invalid SKILL.md frontmatter',
          code: 'validation_error',
        };
      }

      if (frontmatterResult.data.name !== skillId) {
        return {
          success: false,
          error: 'SKILL.md name must match the skill id',
          code: 'validation_error',
        };
      }

      await updateSkill(tenantId, projectId, skillId, {
        description: frontmatterResult.data.description,
        metadata: frontmatterResult.data.metadata ?? null,
        content: parsed.content,
        files: files.map((file) => ({
          filePath: file.filePath,
          content: file.content,
        })),
      });
    } else {
      await updateSkill(tenantId, projectId, skillId, {
        files: files.map((file) => ({
          filePath: file.filePath,
          content: file.content,
        })),
      });
    }

    revalidateSkillFilePaths(tenantId, projectId, skillId, filePath);

    return {
      success: true,
      data: null,
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
      error: error instanceof Error ? error.message : 'Failed to update skill file',
      code: 'unknown_error',
    };
  }
}

export async function deleteSkillFileAction(
  tenantId: string,
  projectId: string,
  skillId: string,
  fileId: string,
  filePath: string
): Promise<ActionResult<null>> {
  try {
    if (filePath === SKILL_ENTRY_FILE_PATH) {
      return {
        success: false,
        error: 'Use the skill delete flow to remove SKILL.md',
        code: 'validation_error',
      };
    }

    await deleteSkillFile(tenantId, projectId, skillId, fileId);

    revalidateSkillFilePaths(tenantId, projectId, skillId, filePath);

    return {
      success: true,
      data: null,
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
      error: error instanceof Error ? error.message : 'Failed to delete skill file',
      code: 'unknown_error',
    };
  }
}

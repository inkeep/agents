import { generateId } from '@inkeep/agents-core';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { skillFiles, skills, subAgentSkills } from '../../db/manage/manage-schema';
import type {
  SkillFileSelect,
  SkillInsert,
  SkillSelect,
  SkillUpdate,
  SubAgentSkillInsert,
  SubAgentSkillWithIndex,
} from '../../types/entities';
import type {
  AgentScopeConfig,
  PaginationConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../../types/utility';
import { getLogger } from '../../utils/logger';
import {
  normalizeSkillFilePath,
  parseSkillMarkdown,
  SKILL_ENTRY_FILE_PATH,
  type SkillFileInput,
  serializeSkillMarkdown,
} from '../../utils/skill-files';
import { agentScopedWhere, projectScopedWhere, subAgentScopedWhere } from './scope-helpers';

const logger = getLogger('skills-dal');

export const getSkillById =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
    const result = await db.query.skills.findFirst({
      where: and(projectScopedWhere(skills, params.scopes), eq(skills.id, params.skillId)),
    });
    return result ?? null;
  };

export const getSkillByIdWithFiles =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    skillId: string;
  }): Promise<SkillRecordWithFiles | null> => {
    const skill = await getSkillById(db)(params);
    if (!skill) {
      return null;
    }

    const files = await getSkillFilesBySkillIds(db)({
      scopes: params.scopes,
      skillIds: [params.skillId],
    });

    return {
      ...skill,
      files: files[params.skillId] ?? [],
    };
  };

export const listSkills =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = projectScopedWhere(skills, params.scopes);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(skills)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(skills.createdAt)),
      db.select({ count: count() }).from(skills).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const listSkillsWithFiles =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const result = await listSkills(db)(params);
    const skillIds = result.data.map((skill) => skill.id);
    const filesBySkillId = await getSkillFilesBySkillIds(db)({
      scopes: params.scopes,
      skillIds,
    });

    return {
      ...result,
      data: result.data.map((skill) => ({
        ...skill,
        files: filesBySkillId[skill.id] ?? [],
      })),
    };
  };

export const createSkill =
  (db: AgentsManageDatabaseClient) =>
  async (data: SkillInsert): Promise<SkillRecordWithFiles> => {
    return await db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const insertData: SkillSelect = {
        tenantId: data.tenantId,
        projectId: data.projectId,
        id: data.name,
        name: data.name,
        description: data.description,
        content: data.content,
        metadata: data.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      };

      const [result] = await tx.insert(skills).values(insertData).returning();

      await replaceSkillFiles(tx, {
        scopes: { tenantId: data.tenantId, projectId: data.projectId },
        skillId: result.id,
        files: getSkillFilesForWrite(
          {
            name: data.name,
            description: data.description,
            metadata: data.metadata ?? null,
            content: data.content,
          },
          data.files
        ),
      });

      const createdSkill = await getSkillByIdWithFiles(tx)({
        scopes: { tenantId: data.tenantId, projectId: data.projectId },
        skillId: result.id,
      });

      if (!createdSkill) {
        throw new Error(`Failed to load created skill "${result.id}"`);
      }

      return createdSkill;
    });
  };

export const upsertSkill = (db: AgentsManageDatabaseClient) => async (data: SkillInsert) => {
  return await db.transaction(async (tx) => {
    const now = new Date().toISOString();
    const baseData: Omit<SkillSelect, 'createdAt' | 'updatedAt'> = {
      tenantId: data.tenantId,
      projectId: data.projectId,
      id: data.name,
      name: data.name,
      description: data.description,
      content: data.content,
      metadata: data.metadata ?? null,
    };

    const scopes = { tenantId: baseData.tenantId, projectId: baseData.projectId };
    const existing = await tx.query.skills.findFirst({
      where: and(projectScopedWhere(skills, scopes), eq(skills.id, baseData.id)),
    });

    const files = getSkillFilesForWrite(
      {
        name: baseData.name,
        description: baseData.description,
        metadata: baseData.metadata,
        content: baseData.content,
      },
      data.files
    );

    if (existing) {
      const [result] = await tx
        .update(skills)
        .set({
          name: baseData.name,
          description: baseData.description,
          content: baseData.content,
          metadata: baseData.metadata,
          updatedAt: now,
        })
        .where(and(projectScopedWhere(skills, scopes), eq(skills.id, baseData.id)))
        .returning();

      await replaceSkillFiles(tx, {
        scopes: { tenantId: baseData.tenantId, projectId: baseData.projectId },
        skillId: baseData.id,
        files,
      });

      logger.info({ skillId: baseData.id }, 'Updated skill');
      return result;
    }

    const insertData: SkillSelect = {
      ...baseData,
      createdAt: now,
      updatedAt: now,
    };

    const [result] = await tx.insert(skills).values(insertData).returning();
    await replaceSkillFiles(tx, {
      scopes: { tenantId: baseData.tenantId, projectId: baseData.projectId },
      skillId: baseData.id,
      files,
    });

    logger.info({ skillId: baseData.id }, 'Created skill');
    return result;
  });
};

export const updateSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string; data: SkillUpdate }) => {
    return await db.transaction(async (tx) => {
      const existing = await tx.query.skills.findFirst({
        where: and(
          eq(skills.tenantId, params.scopes.tenantId),
          eq(skills.projectId, params.scopes.projectId),
          eq(skills.id, params.skillId)
        ),
      });

      if (!existing) {
        return null;
      }

      const mergedData: SkillSnapshot = {
        name: existing.name,
        description:
          'description' in params.data ? (params.data.description as string) : existing.description,
        metadata:
          'metadata' in params.data
            ? ((params.data.metadata as Record<string, string> | null | undefined) ?? null)
            : existing.metadata,
        content: 'content' in params.data ? (params.data.content as string) : existing.content,
      };

      const files = getSkillFilesForWrite(mergedData, params.data.files);
      const updateData: Partial<SkillSelect> = {
        description: mergedData.description,
        metadata: mergedData.metadata,
        content: mergedData.content,
        updatedAt: new Date().toISOString(),
      };

      const [result] = await tx
        .update(skills)
        .set(updateData)
        .where(and(projectScopedWhere(skills, params.scopes), eq(skills.id, params.skillId)))
        .returning();

      await replaceSkillFiles(tx, {
        scopes: params.scopes,
        skillId: params.skillId,
        files,
      });

      return result
        ? await getSkillByIdWithFiles(tx)({
            scopes: params.scopes,
            skillId: params.skillId,
          })
        : null;
    });
  };

export const deleteSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
    const result = await db
      .delete(skills)
      .where(and(projectScopedWhere(skills, params.scopes), eq(skills.id, params.skillId)))
      .returning();

    return result.length > 0;
  };

export const getSkillsForSubAgents =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    subAgentIds: string[];
  }): Promise<SubAgentSkillWithIndex[]> => {
    if (!params.subAgentIds.length) {
      return [];
    }

    return await db
      .select({
        subAgentSkillId: subAgentSkills.id,
        subAgentId: subAgentSkills.subAgentId,
        index: subAgentSkills.index,
        alwaysLoaded: subAgentSkills.alwaysLoaded,
        id: skills.id,
        name: skills.name,
        description: skills.description,
        content: skills.content,
        metadata: skills.metadata,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt,
      })
      .from(subAgentSkills)
      .innerJoin(
        skills,
        and(
          eq(subAgentSkills.skillId, skills.id),
          eq(subAgentSkills.tenantId, skills.tenantId),
          eq(subAgentSkills.projectId, skills.projectId)
        )
      )
      .where(
        and(
          agentScopedWhere(subAgentSkills, params.scopes),
          inArray(subAgentSkills.subAgentId, params.subAgentIds)
        )
      )
      .orderBy(asc(subAgentSkills.index), asc(subAgentSkills.createdAt));
  };

export const upsertSubAgentSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    skillId: string;
    index: number;
    alwaysLoaded?: boolean;
  }) => {
    const now = new Date().toISOString();
    const existing = await db.query.subAgentSkills.findFirst({
      where: and(
        subAgentScopedWhere(subAgentSkills, params.scopes),
        eq(subAgentSkills.skillId, params.skillId)
      ),
    });

    if (existing) {
      const [result] = await db
        .update(subAgentSkills)
        .set({
          index: params.index,
          alwaysLoaded: params.alwaysLoaded ?? existing.alwaysLoaded,
          updatedAt: now,
        })
        .where(eq(subAgentSkills.id, existing.id))
        .returning();

      return result;
    }

    const insertData: SubAgentSkillInsert = {
      ...params.scopes,
      id: generateId(),
      skillId: params.skillId,
      index: params.index,
      alwaysLoaded: params.alwaysLoaded ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const [result] = await db.insert(subAgentSkills).values(insertData).returning();
    return result;
  };

export const deleteSubAgentSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; subAgentSkillId: string }) => {
    const result = await db
      .delete(subAgentSkills)
      .where(
        and(
          agentScopedWhere(subAgentSkills, params.scopes),
          eq(subAgentSkills.id, params.subAgentSkillId)
        )
      )
      .returning();

    return result.length > 0;
  };

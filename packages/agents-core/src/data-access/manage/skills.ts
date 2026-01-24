import { generateId } from '@inkeep/agents-core';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { skills, subAgentSkills } from '../../db/manage/manage-schema';
import type {
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

const logger = getLogger('skills-dal');

export const getSkillById =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
    const result = await db.query.skills.findFirst({
      where: and(
        eq(skills.tenantId, params.scopes.tenantId),
        eq(skills.projectId, params.scopes.projectId),
        eq(skills.id, params.skillId)
      ),
    });
    return result ?? null;
  };

export const listSkills =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(skills.tenantId, params.scopes.tenantId),
      eq(skills.projectId, params.scopes.projectId)
    );

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

export const createSkill = (db: AgentsManageDatabaseClient) => async (data: SkillInsert) => {
  const now = new Date().toISOString();
  const insertData: SkillSelect = {
    ...data,
    id: data.name,
    createdAt: now,
    updatedAt: now,
  };

  const [result] = await db.insert(skills).values(insertData).returning();
  return result;
};

export const upsertSkill = (db: AgentsManageDatabaseClient) => async (data: SkillInsert) => {
  const now = new Date().toISOString();
  const baseData: Omit<SkillSelect, 'createdAt' | 'updatedAt'> = {
    ...data,
    id: data.name,
  };

  const existing = await db.query.skills.findFirst({
    where: and(
      eq(skills.tenantId, baseData.tenantId),
      eq(skills.projectId, baseData.projectId),
      eq(skills.id, baseData.id)
    ),
  });

  if (existing) {
    const [result] = await db
      .update(skills)
      .set({
        name: baseData.name,
        description: baseData.description,
        content: baseData.content,
        metadata: baseData.metadata,
        updatedAt: now,
      })
      .where(
        and(
          eq(skills.tenantId, baseData.tenantId),
          eq(skills.projectId, baseData.projectId),
          eq(skills.id, baseData.id)
        )
      )
      .returning();

    logger.info({ skillId: baseData.id }, 'Updated skill');
    return result;
  }

  const insertData: SkillSelect = {
    ...baseData,
    createdAt: now,
    updatedAt: now,
  };

  const [result] = await db.insert(skills).values(insertData).returning();
  logger.info({ skillId: baseData.id }, 'Created skill');
  return result;
};

export const updateSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string; data: SkillUpdate }) => {
    const { tenantId: _, projectId: _2, ...data } = params.data;
    const updateData: Partial<SkillSelect> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    const [result] = await db
      .update(skills)
      .set(updateData)
      .where(
        and(
          eq(skills.tenantId, params.scopes.tenantId),
          eq(skills.projectId, params.scopes.projectId),
          eq(skills.id, params.skillId)
        )
      )
      .returning();

    return result ?? null;
  };

export const deleteSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
    const result = await db
      .delete(skills)
      .where(
        and(
          eq(skills.tenantId, params.scopes.tenantId),
          eq(skills.projectId, params.scopes.projectId),
          eq(skills.id, params.skillId)
        )
      )
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
          eq(subAgentSkills.tenantId, params.scopes.tenantId),
          eq(subAgentSkills.projectId, params.scopes.projectId),
          eq(subAgentSkills.agentId, params.scopes.agentId),
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
        eq(subAgentSkills.tenantId, params.scopes.tenantId),
        eq(subAgentSkills.projectId, params.scopes.projectId),
        eq(subAgentSkills.agentId, params.scopes.agentId),
        eq(subAgentSkills.subAgentId, params.scopes.subAgentId),
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
          eq(subAgentSkills.tenantId, params.scopes.tenantId),
          eq(subAgentSkills.projectId, params.scopes.projectId),
          eq(subAgentSkills.agentId, params.scopes.agentId),
          eq(subAgentSkills.id, params.subAgentSkillId)
        )
      )
      .returning();

    return result.length > 0;
  };

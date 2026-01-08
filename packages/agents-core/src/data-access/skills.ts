import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { skills, subAgentSkills } from '../db/schema';
import type { SkillInsert, SkillSelect, SkillUpdate, SubAgentSkillInsert } from '../types/entities';
import type {
  AgentScopeConfig,
  PaginationConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../types/utility';
import { generateId } from '../utils/conversations';
import { getLogger } from '../utils/logger';

const logger = getLogger('skills-dal');

type SubAgentSkillWithDetails = {
  subAgentSkillId: string;
  subAgentId: string;
  index: number;
} & Pick<
  SkillSelect,
  'id' | 'name' | 'description' | 'content' | 'metadata' | 'createdAt' | 'updatedAt'
>;

export const getSkillById =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
    return (
      (await db.query.skills.findFirst({
        where: and(
          eq(skills.tenantId, params.scopes.tenantId),
          eq(skills.projectId, params.scopes.projectId),
          eq(skills.id, params.skillId)
        ),
      })) ?? null
    );
  };

export const listSkills =
  (db: DatabaseClient) =>
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

export const createSkill = (db: DatabaseClient) => async (data: SkillInsert) => {
  const now = new Date().toISOString();
  const skillId = data.id || generateId();

  const insertData: SkillInsert = {
    ...data,
    id: skillId,
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata ?? null,
    description: data.description ?? null,
  };

  const result = await db.insert(skills).values(insertData).returning();
  return result[0];
};

export const upsertSkill = (db: DatabaseClient) => async (data: SkillInsert) => {
  const now = new Date().toISOString();
  const skillId = data.id || generateId();
  const baseData: SkillInsert = {
    ...data,
    id: skillId,
    metadata: data.metadata ?? null,
    description: data.description ?? null,
  };

  const existing = await db.query.skills.findFirst({
    where: and(
      eq(skills.tenantId, baseData.tenantId),
      eq(skills.projectId, baseData.projectId),
      eq(skills.id, baseData.id)
    ),
  });

  if (existing) {
    const result = await db
      .update(skills)
      .set({
        name: baseData.name,
        description: baseData.description,
        content: baseData.content,
        metadata: baseData.metadata,
        updatedAt: baseData.updatedAt ?? now,
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
    return result[0];
  }

  const insertData: SkillInsert = {
    ...baseData,
    createdAt: baseData.createdAt ?? now,
    updatedAt: baseData.updatedAt ?? now,
  };

  const result = await db.insert(skills).values(insertData).returning();
  logger.info({ skillId: baseData.id }, 'Created skill');
  return result[0];
};

export const updateSkill =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string; data: SkillUpdate }) => {
    const { id: _id, ...data } = params.data;
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (data.metadata === undefined) {
      delete updateData.metadata;
    }

    if (data.description === undefined) {
      delete updateData.description;
    }

    const result = await db
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

    return result[0] ?? null;
  };

export const deleteSkill =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
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
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; subAgentIds: string[] }) => {
    if (params.subAgentIds.length === 0) {
      return [] as SubAgentSkillWithDetails[];
    }

    const result = await db
      .select({
        subAgentSkillId: subAgentSkills.id,
        subAgentId: subAgentSkills.subAgentId,
        index: subAgentSkills.index,
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

    return result as SubAgentSkillWithDetails[];
  };

export const upsertSubAgentSkill =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; skillId: string; index: number }) => {
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
      const result = await db
        .update(subAgentSkills)
        .set({
          index: params.index,
          updatedAt: now,
        })
        .where(eq(subAgentSkills.id, existing.id))
        .returning();

      return result[0];
    }

    const insertData: SubAgentSkillInsert = {
      ...params.scopes,
      id: generateId(),
      skillId: params.skillId,
      index: params.index,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.insert(subAgentSkills).values(insertData).returning();
    return result[0];
  };

export const deleteSubAgentSkill =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; subAgentSkillId: string }) => {
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

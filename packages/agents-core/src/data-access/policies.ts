import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { policies, subAgentPolicies } from '../db/schema';
import type {
  PolicyInsert,
  PolicySelect,
  PolicyUpdate,
  SubAgentPolicyInsert,
} from '../types/entities';
import type {
  AgentScopeConfig,
  PaginationConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../types/utility';
import { generateId } from '../utils/conversations';

type SubAgentPolicyWithDetails = {
  subAgentPolicyId: string;
  subAgentId: string;
  index: number;
} & Pick<
  PolicySelect,
  'id' | 'name' | 'description' | 'content' | 'metadata' | 'createdAt' | 'updatedAt'
>;

export const getPolicyById =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; policyId: string }) => {
    return (
      (await db.query.policies.findFirst({
        where: and(
          eq(policies.tenantId, params.scopes.tenantId),
          eq(policies.projectId, params.scopes.projectId),
          eq(policies.id, params.policyId)
        ),
      })) ?? null
    );
  };

export const listPolicies =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(policies.tenantId, params.scopes.tenantId),
      eq(policies.projectId, params.scopes.projectId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(policies)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(policies.createdAt)),
      db.select({ count: count() }).from(policies).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const createPolicy = (db: DatabaseClient) => async (data: PolicyInsert) => {
  const now = new Date().toISOString();
  const policyId = data.id || generateId();

  const insertData: PolicyInsert = {
    ...data,
    id: policyId,
    createdAt: now,
    updatedAt: now,
    metadata: data.metadata ?? null,
    description: data.description ?? null,
  };

  const result = await db.insert(policies).values(insertData).returning();
  return result[0];
};

export const updatePolicy =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; policyId: string; data: PolicyUpdate }) => {
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
      .update(policies)
      .set(updateData)
      .where(
        and(
          eq(policies.tenantId, params.scopes.tenantId),
          eq(policies.projectId, params.scopes.projectId),
          eq(policies.id, params.policyId)
        )
      )
      .returning();

    return result[0] ?? null;
  };

export const deletePolicy =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; policyId: string }) => {
    const result = await db
      .delete(policies)
      .where(
        and(
          eq(policies.tenantId, params.scopes.tenantId),
          eq(policies.projectId, params.scopes.projectId),
          eq(policies.id, params.policyId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const getPoliciesForSubAgents =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; subAgentIds: string[] }) => {
    if (params.subAgentIds.length === 0) {
      return [] as SubAgentPolicyWithDetails[];
    }

    const result = await db
      .select({
        subAgentPolicyId: subAgentPolicies.id,
        subAgentId: subAgentPolicies.subAgentId,
        index: subAgentPolicies.index,
        id: policies.id,
        name: policies.name,
        description: policies.description,
        content: policies.content,
        metadata: policies.metadata,
        createdAt: policies.createdAt,
        updatedAt: policies.updatedAt,
      })
      .from(subAgentPolicies)
      .innerJoin(
        policies,
        and(
          eq(subAgentPolicies.policyId, policies.id),
          eq(subAgentPolicies.tenantId, policies.tenantId),
          eq(subAgentPolicies.projectId, policies.projectId)
        )
      )
      .where(
        and(
          eq(subAgentPolicies.tenantId, params.scopes.tenantId),
          eq(subAgentPolicies.projectId, params.scopes.projectId),
          eq(subAgentPolicies.agentId, params.scopes.agentId),
          inArray(subAgentPolicies.subAgentId, params.subAgentIds)
        )
      )
      .orderBy(asc(subAgentPolicies.index), asc(subAgentPolicies.createdAt));

    return result as SubAgentPolicyWithDetails[];
  };

export const upsertSubAgentPolicy =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; policyId: string; index: number }) => {
    const now = new Date().toISOString();
    const existing = await db.query.subAgentPolicies.findFirst({
      where: and(
        eq(subAgentPolicies.tenantId, params.scopes.tenantId),
        eq(subAgentPolicies.projectId, params.scopes.projectId),
        eq(subAgentPolicies.agentId, params.scopes.agentId),
        eq(subAgentPolicies.subAgentId, params.scopes.subAgentId),
        eq(subAgentPolicies.policyId, params.policyId)
      ),
    });

    if (existing) {
      const result = await db
        .update(subAgentPolicies)
        .set({
          index: params.index,
          updatedAt: now,
        })
        .where(eq(subAgentPolicies.id, existing.id))
        .returning();

      return result[0];
    }

    const insertData: SubAgentPolicyInsert = {
      ...params.scopes,
      id: generateId(),
      policyId: params.policyId,
      index: params.index,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.insert(subAgentPolicies).values(insertData).returning();
    return result[0];
  };

export const deleteSubAgentPolicy =
  (db: DatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; subAgentPolicyId: string }) => {
    const result = await db
      .delete(subAgentPolicies)
      .where(
        and(
          eq(subAgentPolicies.tenantId, params.scopes.tenantId),
          eq(subAgentPolicies.projectId, params.scopes.projectId),
          eq(subAgentPolicies.agentId, params.scopes.agentId),
          eq(subAgentPolicies.id, params.subAgentPolicyId)
        )
      )
      .returning();

    return result.length > 0;
  };

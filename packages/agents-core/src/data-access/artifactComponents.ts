import { and, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { createDataAccessFn } from '../db/data-access-helper';
import {
  artifactComponents,
  subAgentArtifactComponents,
  subAgentRelations,
  subAgents,
} from '../db/schema';
import type {
  ArtifactComponentInsert,
  ArtifactComponentSelect,
  ArtifactComponentUpdate,
} from '../types/entities';
import type {
  AgentScopeConfig,
  PaginationConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../types/utility';
import { generateId } from '../utils/conversations';
import { validatePropsAsJsonSchema } from '../validation/props-validation';

export const getArtifactComponentById = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig; id: string }) => {
    return await db.query.artifactComponents.findFirst({
      where: and(
        eq(artifactComponents.tenantId, params.scopes.tenantId),
        eq(artifactComponents.projectId, params.scopes.projectId),
        eq(artifactComponents.id, params.id)
      ),
    });
  }
);

export const listArtifactComponents = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig }) => {
    return await db
      .select()
      .from(artifactComponents)
      .where(
        and(
          eq(artifactComponents.tenantId, params.scopes.tenantId),
          eq(artifactComponents.projectId, params.scopes.projectId)
        )
      )
      .orderBy(desc(artifactComponents.createdAt));
  }
);

export const listArtifactComponentsPaginated = createDataAccessFn(
  async (
    db: DatabaseClient,
    params: {
      scopes: ProjectScopeConfig;
      pagination?: PaginationConfig;
    }
  ): Promise<{
    data: ArtifactComponentSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(artifactComponents.tenantId, params.scopes.tenantId),
      eq(artifactComponents.projectId, params.scopes.projectId)
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(artifactComponents)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(artifactComponents.createdAt)),
      db.select({ count: count() }).from(artifactComponents).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const totalNumber = typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
    const pages = Math.ceil(totalNumber / limit);

    return {
      data,
      pagination: { page, limit, total: totalNumber, pages },
    };
  }
);

export const createArtifactComponent =
  (db: DatabaseClient) => async (params: ArtifactComponentInsert) => {
    if (params.props !== null && params.props !== undefined) {
      const propsValidation = validatePropsAsJsonSchema(params.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw new Error(`Invalid props schema: ${errorMessages}`);
      }
    }

    const now = new Date().toISOString();

    const [artifactComponent] = await db
      .insert(artifactComponents)
      .values({
        ...params,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return artifactComponent;
  };

export const updateArtifactComponent =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string; data: ArtifactComponentUpdate }) => {
    if (params.data.props !== undefined && params.data.props !== null) {
      const propsValidation = validatePropsAsJsonSchema(params.data.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw new Error(`Invalid props schema: ${errorMessages}`);
      }
    }

    const now = new Date().toISOString();

    const [updated] = await db
      .update(artifactComponents)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(artifactComponents.tenantId, params.scopes.tenantId),
          eq(artifactComponents.projectId, params.scopes.projectId),
          eq(artifactComponents.id, params.id)
        )
      )
      .returning();

    return updated;
  };

export const deleteArtifactComponent =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; id: string }): Promise<boolean> => {
    try {
      const result = await db
        .delete(artifactComponents)
        .where(
          and(
            eq(artifactComponents.tenantId, params.scopes.tenantId),
            eq(artifactComponents.projectId, params.scopes.projectId),
            eq(artifactComponents.id, params.id)
          )
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Error deleting artifact component:', error);
      return false;
    }
  };

export const getArtifactComponentsForAgent = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: SubAgentScopeConfig }) => {
    return await db
      .select({
        id: artifactComponents.id,
        tenantId: artifactComponents.tenantId,
        projectId: artifactComponents.projectId,
        name: artifactComponents.name,
        description: artifactComponents.description,
        props: artifactComponents.props,
        createdAt: artifactComponents.createdAt,
        updatedAt: artifactComponents.updatedAt,
      })
      .from(artifactComponents)
      .innerJoin(
        subAgentArtifactComponents,
        eq(artifactComponents.id, subAgentArtifactComponents.artifactComponentId)
      )
      .where(
        and(
          eq(artifactComponents.tenantId, params.scopes.tenantId),
          eq(artifactComponents.projectId, params.scopes.projectId),
          eq(subAgentArtifactComponents.agentId, params.scopes.agentId),
          eq(subAgentArtifactComponents.subAgentId, params.scopes.subAgentId)
        )
      )
      .orderBy(desc(artifactComponents.createdAt));
  }
);

export const associateArtifactComponentWithAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; artifactComponentId: string }) => {
    const [association] = await db
      .insert(subAgentArtifactComponents)
      .values({
        id: generateId(),
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.scopes.agentId,
        subAgentId: params.scopes.subAgentId,
        artifactComponentId: params.artifactComponentId,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return association;
  };

export const removeArtifactComponentFromAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; artifactComponentId: string }) => {
    try {
      const result = await db
        .delete(subAgentArtifactComponents)
        .where(
          and(
            eq(subAgentArtifactComponents.tenantId, params.scopes.tenantId),
            eq(subAgentArtifactComponents.projectId, params.scopes.projectId),
            eq(subAgentArtifactComponents.agentId, params.scopes.agentId),
            eq(subAgentArtifactComponents.subAgentId, params.scopes.subAgentId),
            eq(subAgentArtifactComponents.artifactComponentId, params.artifactComponentId)
          )
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error('Error removing artifact component from agent:', error);
      return false;
    }
  };

export const deleteAgentArtifactComponentRelationByAgent =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    const result = await db
      .delete(subAgentArtifactComponents)
      .where(
        and(
          eq(subAgentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(subAgentArtifactComponents.agentId, params.scopes.agentId),
          eq(subAgentArtifactComponents.subAgentId, params.scopes.subAgentId)
        )
      )
      .returning();
    return result.length > 0;
  };

export const getAgentsUsingArtifactComponent = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig; artifactComponentId: string }) => {
    return await db
      .select({
        agentId: subAgentArtifactComponents.agentId,
        subAgentId: subAgentArtifactComponents.subAgentId,
        createdAt: subAgentArtifactComponents.createdAt,
      })
      .from(subAgentArtifactComponents)
      .where(
        and(
          eq(subAgentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(subAgentArtifactComponents.projectId, params.scopes.projectId),
          eq(subAgentArtifactComponents.artifactComponentId, params.artifactComponentId)
        )
      )
      .orderBy(desc(subAgentArtifactComponents.createdAt));
  }
);

export const isArtifactComponentAssociatedWithAgent = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: SubAgentScopeConfig; artifactComponentId: string }) => {
    const result = await db
      .select({ id: subAgentArtifactComponents.id })
      .from(subAgentArtifactComponents)
      .where(
        and(
          eq(subAgentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(subAgentArtifactComponents.projectId, params.scopes.projectId),
          eq(subAgentArtifactComponents.agentId, params.scopes.agentId),
          eq(subAgentArtifactComponents.subAgentId, params.scopes.subAgentId),
          eq(subAgentArtifactComponents.artifactComponentId, params.artifactComponentId)
        )
      )
      .limit(1);

    return result.length > 0;
  }
);

export const agentHasArtifactComponents = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: AgentScopeConfig }): Promise<boolean> => {
    const result = await db
      .select({ count: count() })
      .from(subAgentArtifactComponents)
      .innerJoin(
        subAgents,
        and(
          eq(subAgentArtifactComponents.subAgentId, subAgents.id),
          eq(subAgentArtifactComponents.tenantId, subAgents.tenantId)
        )
      )
      .innerJoin(
        subAgentRelations,
        and(
          eq(subAgents.id, subAgentRelations.sourceSubAgentId),
          eq(subAgents.tenantId, subAgentRelations.tenantId),
          eq(subAgents.projectId, subAgentRelations.projectId),
          eq(subAgents.agentId, subAgentRelations.agentId)
        )
      )
      .where(
        and(
          eq(subAgentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(subAgentArtifactComponents.projectId, params.scopes.projectId),
          eq(subAgentRelations.agentId, params.scopes.agentId)
        )
      )
      .limit(1);

    const total = result[0]?.count || 0;
    const totalNumber = typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);

    return totalNumber > 0;
  }
);

export const countArtifactComponents = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(artifactComponents)
      .where(
        and(
          eq(artifactComponents.tenantId, params.scopes.tenantId),
          eq(artifactComponents.projectId, params.scopes.projectId)
        )
      );

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  }
);

export const countArtifactComponentsForAgent = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: SubAgentScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(subAgentArtifactComponents)
      .where(
        and(
          eq(subAgentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(subAgentArtifactComponents.projectId, params.scopes.projectId),
          eq(subAgentArtifactComponents.agentId, params.scopes.agentId),
          eq(subAgentArtifactComponents.subAgentId, params.scopes.subAgentId)
        )
      );

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  }
);

/**
 * Upsert agent-artifact component relation (create if it doesn't exist, no-op if it does)
 */
export const upsertAgentArtifactComponentRelation =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; artifactComponentId: string }) => {
    const exists = await isArtifactComponentAssociatedWithAgent(db)(params);

    if (!exists) {
      return await associateArtifactComponentWithAgent(db)(params);
    }

    // If it exists, we could optionally return the existing relation
    // For now, just return success indication
    return null;
  };

/**
 * Upsert an artifact component (create if it doesn't exist, update if it does)
 */
export const upsertArtifactComponent =
  (db: DatabaseClient) =>
  async (params: { data: ArtifactComponentInsert }): Promise<ArtifactComponentSelect> => {
    const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId };

    const existing = await getArtifactComponentById(db)({
      scopes,
      id: params.data.id,
    });

    if (existing) {
      return await updateArtifactComponent(db)({
        scopes,
        id: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          props: params.data.props,
        },
      });
    }
    return await createArtifactComponent(db)(params.data);
  };

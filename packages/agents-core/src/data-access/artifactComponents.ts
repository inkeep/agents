import { and, eq, desc, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { artifactComponents, agentArtifactComponents, agents, agentRelations } from '../db/schema';
import type {
  ArtifactComponentInsert,
  ArtifactComponentSelect,
  ArtifactComponentUpdate,
} from '../types/entities';
import type { PaginationConfig, ScopeConfig } from '../types/utility';

export const getArtifactComponentById =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; id: string }) => {
    return await db.query.artifactComponents.findFirst({
      where: and(
        eq(artifactComponents.tenantId, params.scopes.tenantId),
        eq(artifactComponents.projectId, params.scopes.projectId),
        eq(artifactComponents.id, params.id)
      ),
    });
  };

export const listArtifactComponents =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig }) => {
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
  };

export const listArtifactComponentsPaginated =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ScopeConfig;
    pagination?: PaginationConfig;
  }): Promise<{
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
  };

export const createArtifactComponent =
  (db: DatabaseClient) => async (params: ArtifactComponentInsert) => {
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
  async (params: { scopes: ScopeConfig; id: string; data: ArtifactComponentUpdate }) => {
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
  async (params: { scopes: ScopeConfig; id: string }): Promise<boolean> => {
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

export const getArtifactComponentsForAgent =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; agentId: string }) => {
    return await db
      .select({
        id: artifactComponents.id,
        tenantId: artifactComponents.tenantId,
        projectId: artifactComponents.projectId,
        name: artifactComponents.name,
        description: artifactComponents.description,
        summaryProps: artifactComponents.summaryProps,
        fullProps: artifactComponents.fullProps,
        createdAt: artifactComponents.createdAt,
        updatedAt: artifactComponents.updatedAt,
      })
      .from(artifactComponents)
      .innerJoin(
        agentArtifactComponents,
        eq(artifactComponents.id, agentArtifactComponents.artifactComponentId)
      )
      .where(
        and(
          eq(artifactComponents.tenantId, params.scopes.tenantId),
          eq(artifactComponents.projectId, params.scopes.projectId),
          eq(agentArtifactComponents.agentId, params.agentId)
        )
      )
      .orderBy(desc(artifactComponents.createdAt));
  };

export const associateArtifactComponentWithAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; artifactComponentId: string }) => {
    const [association] = await db
      .insert(agentArtifactComponents)
      .values({
        id: nanoid(),
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.agentId,
        artifactComponentId: params.artifactComponentId,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return association;
  };

export const removeArtifactComponentFromAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; artifactComponentId: string }) => {
    try {
      const result = await db
        .delete(agentArtifactComponents)
        .where(
          and(
            eq(agentArtifactComponents.tenantId, params.scopes.tenantId),
            eq(agentArtifactComponents.projectId, params.scopes.projectId),
            eq(agentArtifactComponents.agentId, params.agentId),
            eq(agentArtifactComponents.artifactComponentId, params.artifactComponentId)
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
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; agentId: string }) => {
    const result = await db
      .delete(agentArtifactComponents)
      .where(
        and(
          eq(agentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(agentArtifactComponents.agentId, params.agentId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };

export const getAgentsUsingArtifactComponent =
  (db: DatabaseClient) => async (params: { scopes: ScopeConfig; artifactComponentId: string }) => {
    return await db
      .select({
        agentId: agentArtifactComponents.agentId,
        createdAt: agentArtifactComponents.createdAt,
      })
      .from(agentArtifactComponents)
      .where(
        and(
          eq(agentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(agentArtifactComponents.projectId, params.scopes.projectId),
          eq(agentArtifactComponents.artifactComponentId, params.artifactComponentId)
        )
      )
      .orderBy(desc(agentArtifactComponents.createdAt));
  };

export const isArtifactComponentAssociatedWithAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; artifactComponentId: string }) => {
    const result = await db
      .select({ id: agentArtifactComponents.id })
      .from(agentArtifactComponents)
      .where(
        and(
          eq(agentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(agentArtifactComponents.projectId, params.scopes.projectId),
          eq(agentArtifactComponents.agentId, params.agentId),
          eq(agentArtifactComponents.artifactComponentId, params.artifactComponentId)
        )
      )
      .limit(1);

    return result.length > 0;
  };

export const graphHasArtifactComponents =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; graphId: string }): Promise<boolean> => {
    const result = await db
      .select({ count: count() })
      .from(agentArtifactComponents)
      .innerJoin(agents, eq(agentArtifactComponents.agentId, agents.id))
      .innerJoin(agentRelations, eq(agents.id, agentRelations.sourceAgentId))
      .where(
        and(
          eq(agentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(agentArtifactComponents.projectId, params.scopes.projectId),
          eq(agentRelations.graphId, params.graphId)
        )
      )
      .limit(1);

    const total = result[0]?.count || 0;
    const totalNumber = typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);

    return totalNumber > 0;
  };

export const countArtifactComponents =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig }): Promise<number> => {
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
  };

export const countArtifactComponentsForAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(agentArtifactComponents)
      .where(
        and(
          eq(agentArtifactComponents.tenantId, params.scopes.tenantId),
          eq(agentArtifactComponents.projectId, params.scopes.projectId),
          eq(agentArtifactComponents.agentId, params.agentId)
        )
      );

    const total = result[0]?.count || 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };

/**
 * Upsert agent-artifact component relation (create if it doesn't exist, no-op if it does)
 */
export const upsertAgentArtifactComponentRelation =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig; agentId: string; artifactComponentId: string }) => {
    // Check if relation already exists
    const exists = await isArtifactComponentAssociatedWithAgent(db)(params);

    if (!exists) {
      // Create the relation if it doesn't exist
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
      // Update existing artifact component
      return await updateArtifactComponent(db)({
        scopes,
        id: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          summaryProps: params.data.summaryProps,
          fullProps: params.data.fullProps,
        },
      });
    } else {
      // Create new artifact component
      return await createArtifactComponent(db)(params.data);
    }
  };

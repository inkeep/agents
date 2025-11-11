import { and, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { createDataAccessFn } from '../db/data-access-helper';
import { dataComponents, subAgentDataComponents } from '../db/schema';
import type {
  DataComponentInsert,
  DataComponentSelect,
  DataComponentUpdate,
  PaginationConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../types/index';
import { createApiError } from '../utils';
import { generateId } from '../utils/conversations';
import { validatePropsAsJsonSchema } from '../validation/props-validation';
import { validateRender } from '../validation/render-validation';

/**
 * Get a data component by ID
 */
export const getDataComponent = createDataAccessFn(
  async (
    db: DatabaseClient,
    params: {
      scopes: ProjectScopeConfig;
      dataComponentId: string;
    }
  ): Promise<DataComponentSelect | null> => {
    const result = await db.query.dataComponents.findFirst({
      where: and(
        eq(dataComponents.tenantId, params.scopes.tenantId),
        eq(dataComponents.projectId, params.scopes.projectId),
        eq(dataComponents.id, params.dataComponentId)
      ),
    });

    return result || null;
  }
);

/**
 * List all data components for a tenant/project
 */
export const listDataComponents = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig }): Promise<DataComponentSelect[]> => {
    return await db
      .select()
      .from(dataComponents)
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId)
        )
      )
      .orderBy(desc(dataComponents.createdAt));
  }
);

/**
 * List data components with pagination
 */
export const listDataComponentsPaginated = createDataAccessFn(
  async (
    db: DatabaseClient,
    params: {
      scopes: ProjectScopeConfig;
      pagination?: PaginationConfig;
    }
  ): Promise<{
    data: DataComponentSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(dataComponents)
        .where(
          and(
            eq(dataComponents.tenantId, params.scopes.tenantId),
            eq(dataComponents.projectId, params.scopes.projectId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(dataComponents.createdAt)),
      db
        .select({ count: count() })
        .from(dataComponents)
        .where(
          and(
            eq(dataComponents.tenantId, params.scopes.tenantId),
            eq(dataComponents.projectId, params.scopes.projectId)
          )
        ),
    ]);

    const total =
      typeof totalResult[0]?.count === 'string'
        ? parseInt(totalResult[0].count, 10)
        : totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  }
);

/**
 * Create a new data component
 */
export const createDataComponent =
  (db: DatabaseClient) =>
  async (params: DataComponentInsert): Promise<DataComponentSelect> => {
    if (params.props) {
      const propsValidation = validatePropsAsJsonSchema(params.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw new Error(`Invalid props schema: ${errorMessages}`);
      }
    }

    if (params.render !== undefined && params.render !== null) {
      if (
        typeof params.render === 'object' &&
        params.render !== null &&
        'component' in params.render &&
        'mockData' in params.render
      ) {
        const renderValidation = validateRender(
          params.render as { component: string; mockData: Record<string, unknown> }
        );
        if (!renderValidation.isValid) {
          const errorMessages = renderValidation.errors
            .map((e) => `${e.field}: ${e.message}`)
            .join(', ');
          throw new Error(`Invalid render: ${errorMessages}`);
        }
      }
    }

    const dataComponent = await db
      .insert(dataComponents)
      .values(params as any)
      .returning();

    return dataComponent[0];
  };

/**
 * Update a data component
 */
export const updateDataComponent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    dataComponentId: string;
    data: DataComponentUpdate;
  }): Promise<DataComponentSelect | null> => {
    if (params.data.props !== undefined && params.data.props !== null) {
      const propsValidation = validatePropsAsJsonSchema(params.data.props);
      if (!propsValidation.isValid) {
        const errorMessages = propsValidation.errors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        throw createApiError({
          code: 'bad_request',
          message: `Invalid props schema: ${errorMessages}`,
        });
      }
    }

    if (params.data.render) {
      if (
        typeof params.data.render === 'object' &&
        'component' in params.data.render &&
        'mockData' in params.data.render
      ) {
        const renderValidation = validateRender(
          params.data.render as { component: string; mockData: Record<string, unknown> }
        );
        if (!renderValidation.isValid) {
          const errorMessages = renderValidation.errors
            .map((e) => `${e.field}: ${e.message}`)
            .join(', ');
          throw createApiError({
            code: 'bad_request',
            message: `Invalid render: ${errorMessages}`,
          });
        }
      }
    }

    const now = new Date().toISOString();

    await db
      .update(dataComponents)
      .set({
        ...params.data,
        updatedAt: now,
      } as any)
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId),
          eq(dataComponents.id, params.dataComponentId)
        )
      );

    return await getDataComponent(db)({
      scopes: params.scopes,
      dataComponentId: params.dataComponentId,
    });
  };

/**
 * Delete a data component
 */
export const deleteDataComponent =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; dataComponentId: string }): Promise<boolean> => {
    const result = await db
      .delete(dataComponents)
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId),
          eq(dataComponents.id, params.dataComponentId)
        )
      )
      .returning();

    return result.length > 0;
  };

/**
 * Get data components for a specific agent
 */
export const getDataComponentsForAgent = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: SubAgentScopeConfig }): Promise<DataComponentSelect[]> => {
    return await db
      .select({
        id: dataComponents.id,
        tenantId: dataComponents.tenantId,
        projectId: dataComponents.projectId,
        name: dataComponents.name,
        description: dataComponents.description,
        props: dataComponents.props,
        createdAt: dataComponents.createdAt,
        updatedAt: dataComponents.updatedAt,
        render: dataComponents.render,
      })
      .from(dataComponents)
      .innerJoin(
        subAgentDataComponents,
        eq(dataComponents.id, subAgentDataComponents.dataComponentId)
      )
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId),
          eq(subAgentDataComponents.agentId, params.scopes.agentId),
          eq(subAgentDataComponents.subAgentId, params.scopes.subAgentId)
        )
      )
      .orderBy(desc(dataComponents.createdAt));
  }
);

/**
 * Associate a data component with an agent
 */
export const associateDataComponentWithAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; dataComponentId: string }) => {
    const association = await db
      .insert(subAgentDataComponents)
      .values({
        id: generateId(),
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        agentId: params.scopes.agentId,
        subAgentId: params.scopes.subAgentId,
        dataComponentId: params.dataComponentId,
      })
      .returning();

    return association[0];
  };

/**
 * Remove association between data component and agent
 */
export const removeDataComponentFromAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; dataComponentId: string }): Promise<boolean> => {
    const result = await db
      .delete(subAgentDataComponents)
      .where(
        and(
          eq(subAgentDataComponents.tenantId, params.scopes.tenantId),
          eq(subAgentDataComponents.projectId, params.scopes.projectId),
          eq(subAgentDataComponents.agentId, params.scopes.agentId),
          eq(subAgentDataComponents.subAgentId, params.scopes.subAgentId),
          eq(subAgentDataComponents.dataComponentId, params.dataComponentId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteAgentDataComponentRelationByAgent =
  (db: DatabaseClient) => async (params: { scopes: SubAgentScopeConfig }) => {
    const result = await db
      .delete(subAgentDataComponents)
      .where(
        and(
          eq(subAgentDataComponents.tenantId, params.scopes.tenantId),
          eq(subAgentDataComponents.agentId, params.scopes.agentId),
          eq(subAgentDataComponents.subAgentId, params.scopes.subAgentId)
        )
      )
      .returning();
    return result.length > 0;
  };

/**
 * Get all agents that use a specific data component
 */
export const getAgentsUsingDataComponent = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig; dataComponentId: string }) => {
    return await db
      .select({
        subAgentId: subAgentDataComponents.subAgentId,
        createdAt: subAgentDataComponents.createdAt,
      })
      .from(subAgentDataComponents)
      .where(
        and(
          eq(subAgentDataComponents.tenantId, params.scopes.tenantId),
          eq(subAgentDataComponents.projectId, params.scopes.projectId),
          eq(subAgentDataComponents.dataComponentId, params.dataComponentId)
        )
      )
      .orderBy(desc(subAgentDataComponents.createdAt));
  }
);

/**
 * Check if a data component is associated with an agent
 */
export const isDataComponentAssociatedWithAgent = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: SubAgentScopeConfig; dataComponentId: string }): Promise<boolean> => {
    const result = await db
      .select({ id: subAgentDataComponents.id })
      .from(subAgentDataComponents)
      .where(
        and(
          eq(subAgentDataComponents.tenantId, params.scopes.tenantId),
          eq(subAgentDataComponents.projectId, params.scopes.projectId),
          eq(subAgentDataComponents.agentId, params.scopes.agentId),
          eq(subAgentDataComponents.subAgentId, params.scopes.subAgentId),
          eq(subAgentDataComponents.dataComponentId, params.dataComponentId)
        )
      )
      .limit(1);

    return result.length > 0;
  }
);

/**
 * Upsert agent-data component relation (create if it doesn't exist, no-op if it does)
 */
export const upsertAgentDataComponentRelation =
  (db: DatabaseClient) =>
  async (params: { scopes: SubAgentScopeConfig; dataComponentId: string }) => {
    const exists = await isDataComponentAssociatedWithAgent(db)(params);

    if (!exists) {
      return await associateDataComponentWithAgent(db)(params);
    }

    // If it exists, we could optionally return the existing relation
    // For now, just return success indication
    return null;
  };

/**
 * Count data components for a tenant/project
 */
export const countDataComponents = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(dataComponents)
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId)
        )
      );

    const countValue = result[0]?.count;
    return typeof countValue === 'string' ? parseInt(countValue, 10) : countValue || 0;
  }
);

/**
 * Upsert a data component (create if it doesn't exist, update if it does)
 */
export const upsertDataComponent =
  (db: DatabaseClient) =>
  async (params: { data: DataComponentInsert }): Promise<DataComponentSelect | null> => {
    const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId };

    const existing = await getDataComponent(db)({
      scopes,
      dataComponentId: params.data.id,
    });

    if (existing) {
      return await updateDataComponent(db)({
        scopes,
        dataComponentId: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          props: params.data.props,
        },
      });
    }
    return await createDataComponent(db)(params.data);
  };

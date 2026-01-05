import {
  commonGetErrorResponses,
  createApiError,
  createEvaluationRunConfig,
  createEvaluationRunConfigEvaluationSuiteConfigRelation,
  deleteEvaluationRunConfig,
  deleteEvaluationRunConfigEvaluationSuiteConfigRelation,
  generateId,
  getEvaluationRunConfigById,
  getEvaluationRunConfigEvaluationSuiteConfigRelations,
  ListResponseSchema,
  listEvaluationRunConfigs,
  SingleResponseSchema,
  TenantProjectParamsSchema,
  updateEvaluationRunConfig,
  EvaluationRunConfigApiSelectSchema,
  EvaluationRunConfigApiInsertSchema,
  EvaluationRunConfigApiUpdateSchema,
} from '@inkeep/agents-core';
import { z, createRoute, OpenAPIHono } from '@hono/zod-openapi';
import manageDbClient from '../../data/db/manageDbClient';
import { getLogger } from '../../logger';

const app = new OpenAPIHono();
const logger = getLogger('evaluationRunConfigs');

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-run-configs',
    summary: 'List Evaluation Run Configs',
    operationId: 'list-evaluation-run-configs',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'List of evaluation run configs',
        content: {
          'application/json': {
            schema: ListResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');

    try {
      const configs = await listEvaluationRunConfigs(manageDbClient)({
        scopes: { tenantId, projectId },
      });

      // Fetch suite config relations for all configs
      const configsWithSuiteConfigs = await Promise.all(
        configs.map(async (config) => {
          const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
            manageDbClient
          )({
            scopes: { tenantId, projectId, evaluationRunConfigId: config.id },
          });
          return {
            ...config,
            suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
          };
        })
      );

      return c.json({
        data: configsWithSuiteConfigs as any,
        pagination: {
          page: 1,
          limit: configsWithSuiteConfigs.length,
          total: configsWithSuiteConfigs.length,
          pages: 1,
        },
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list evaluation run configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list evaluation run configs',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluation-run-configs/{configId}',
    summary: 'Get Evaluation Run Config by ID',
    operationId: 'get-evaluation-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      200: {
        description: 'Evaluation run config details',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const config = await getEvaluationRunConfigById(manageDbClient)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      if (!config) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation run config not found' }),
          404
        ) as any;
      }

      // Get linked suite configs
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
        manageDbClient
      )({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      return c.json({
        data: {
          ...config,
          suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
        } as any,
      }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, configId }, 'Failed to get evaluation run config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation run config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/evaluation-run-configs',
    summary: 'Create Evaluation Run Config',
    operationId: 'create-evaluation-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: EvaluationRunConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation run config created',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { suiteConfigIds, ...runConfigData } = configData;

    try {
      const id = runConfigData.id || generateId();
      const created = await createEvaluationRunConfig(manageDbClient)({
        ...runConfigData,
        id,
        tenantId,
        projectId,
        isActive: runConfigData.isActive !== undefined ? runConfigData.isActive : true,
      } as any);

      // Create suite config relations if provided
      if (suiteConfigIds && Array.isArray(suiteConfigIds) && suiteConfigIds.length > 0) {
        await Promise.all(
          suiteConfigIds.map((suiteConfigId: string) =>
            createEvaluationRunConfigEvaluationSuiteConfigRelation(manageDbClient)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationRunConfigId: id,
              evaluationSuiteConfigId: suiteConfigId,
            } as any)
          )
        );
      }

      // Fetch suite config relations to include in response
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
        manageDbClient
      )({
        scopes: { tenantId, projectId, evaluationRunConfigId: id },
      });

      logger.info({ tenantId, projectId, configId: id }, 'Evaluation run config created');
      return c.json(
        {
          data: {
            ...created,
            suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
          } as any,
        },
        201
      ) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configData },
        'Failed to create evaluation run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation run config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/evaluation-run-configs/{configId}',
    summary: 'Update Evaluation Run Config',
    operationId: 'update-evaluation-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: EvaluationRunConfigApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation run config updated',
        content: {
          'application/json': {
            schema: SingleResponseSchema(EvaluationRunConfigApiSelectSchema),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');
    const configData = c.req.valid('json') as any;
    const { suiteConfigIds, ...runConfigUpdateData } = configData;

    try {
      const updated = await updateEvaluationRunConfig(manageDbClient)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
        data: runConfigUpdateData,
      });

      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation run config not found' }),
          404
        ) as any;
      }

      // Update suite config relations if provided
      if (suiteConfigIds !== undefined) {
        // Get existing relations
        const existingRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
          manageDbClient
        )({
          scopes: { tenantId, projectId, evaluationRunConfigId: configId },
        });

        const existingSuiteConfigIds = existingRelations.map((rel) => rel.evaluationSuiteConfigId);
        const newSuiteConfigIds = Array.isArray(suiteConfigIds) ? suiteConfigIds : [];

        // Delete relations that are no longer in the list
        const toDelete = existingSuiteConfigIds.filter((id) => !newSuiteConfigIds.includes(id));
        await Promise.all(
          toDelete.map((suiteConfigId) =>
            deleteEvaluationRunConfigEvaluationSuiteConfigRelation(manageDbClient)({
              scopes: {
                tenantId,
                projectId,
                evaluationRunConfigId: configId,
                evaluationSuiteConfigId: suiteConfigId,
              },
            })
          )
        );

        // Create new relations
        const toCreate = newSuiteConfigIds.filter((id) => !existingSuiteConfigIds.includes(id));
        await Promise.all(
          toCreate.map((suiteConfigId) =>
            createEvaluationRunConfigEvaluationSuiteConfigRelation(manageDbClient)({
              tenantId,
              projectId,
              id: generateId(),
              evaluationRunConfigId: configId,
              evaluationSuiteConfigId: suiteConfigId,
            } as any)
          )
        );
      }

      // Fetch suite config relations to include in response
      const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
        manageDbClient
      )({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      logger.info({ tenantId, projectId, configId }, 'Evaluation run config updated');
      return c.json({
        data: {
          ...updated,
          suiteConfigIds: suiteConfigRelations.map((rel) => rel.evaluationSuiteConfigId),
        } as any,
      }) as any;
    } catch (error) {
      logger.error(
        { error, tenantId, projectId, configId, configData },
        'Failed to update evaluation run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation run config',
        }),
        500
      );
    }
  }
);

app.openapi(
  createRoute({
    method: 'delete',
    path: '/evaluation-run-configs/{configId}',
    summary: 'Delete Evaluation Run Config',
    operationId: 'delete-evaluation-run-config',
    tags: ['Evaluations'],
    request: {
      params: TenantProjectParamsSchema.extend({ configId: z.string() }),
    },
    responses: {
      204: {
        description: 'Evaluation run config deleted',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, configId } = c.req.valid('param');

    try {
      const deleted = await deleteEvaluationRunConfig(manageDbClient)({
        scopes: { tenantId, projectId, evaluationRunConfigId: configId },
      });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation run config not found' }),
          404
        ) as any;
      }

      logger.info({ tenantId, projectId, configId }, 'Evaluation run config deleted');
      return c.body(null, 204) as any;
    } catch (error: any) {
      logger.error(
        {
          error: error?.message || error,
          errorStack: error?.stack,
          errorCode: error?.cause?.code,
          errorDetail: error?.cause?.detail,
          errorConstraint: error?.cause?.constraint,
          tenantId,
          projectId,
          configId,
        },
        'Failed to delete evaluation run config'
      );
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message:
            error?.cause?.detail || error?.message || 'Failed to delete evaluation run config',
        }),
        500
      );
    }
  }
);

export default app;

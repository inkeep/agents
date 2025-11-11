import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  conversations,
  createApiError,
  createConversationEvaluationConfig,
  createDataset,
  createDatasetItem,
  createEvalResult,
  createEvalTestSuiteConfig,
  createEvaluator,
  deleteConversationEvaluationConfig,
  deleteDataset,
  deleteDatasetItem,
  deleteEvalResult,
  deleteEvalTestSuiteConfig,
  deleteEvaluator,
  getConversation,
  getConversationEvaluationConfig,
  getDataset,
  getDatasetItem,
  getEvalResult,
  getEvalResultsByConversation,
  getEvalResultsByEvaluator,
  getEvalTestSuiteConfig,
  getEvaluator,
  listConversationEvaluationConfigs,
  listDatasetItems,
  listDatasets,
  listEvalTestSuiteConfigs,
  listEvaluators,
  startConversationEvaluationConfig,
  stopConversationEvaluationConfig,
  TenantParamsSchema,
  updateConversationEvaluationConfig,
  updateDataset,
  updateDatasetItem,
  updateEvalResult,
  updateEvalTestSuiteConfig,
  updateEvaluator,
} from '@inkeep/agents-core';
import { and, eq } from 'drizzle-orm';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { runConversationEvaluation, runDatasetEval } from '../services/EvaluationService';

const logger = getLogger('evaluations');

const app = new OpenAPIHono();

// Request/Response schemas

const ConversationIdParamsSchema = TenantParamsSchema.extend({
  conversationId: z.string().openapi({ param: { name: 'conversationId', in: 'path' } }),
});

const EvaluatorIdParamsSchema = TenantParamsSchema.extend({
  evaluatorId: z.string().openapi({ param: { name: 'evaluatorId', in: 'path' } }),
});

const EvalResultIdParamsSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

const RunConversationEvaluationRequestSchema = z
  .object({
    conversationEvaluationConfigId: z.string(),
  })
  .openapi('RunConversationEvaluationRequest');

const RunDatasetEvalRequestSchema = z
  .object({
    testSuiteConfigId: z.string(),
    datasetId: z.string(),
    agentId: z.string(),
    evaluatorIds: z.array(z.string()),
  })
  .openapi('RunDatasetEvalRequest');

const CreateEvalResultRequestSchema = z
  .object({
    conversationId: z.string(),
    evaluatorId: z.string(),
    status: z.enum(['pending', 'done', 'failed']),
    reasoning: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    suiteRunId: z.string().optional(),
    datasetItemId: z.string().optional(),
  })
  .openapi('CreateEvalResultRequest');

const UpdateEvalResultRequestSchema = z
  .object({
    status: z.enum(['pending', 'done', 'failed']).optional(),
    reasoning: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('UpdateEvalResultRequest');

const EvalResultSchema = z
  .object({
    id: z.string(),
    suiteRunId: z.string().nullable(),
    datasetItemId: z.string().nullable(),
    conversationId: z.string(),
    status: z.enum(['pending', 'done', 'failed']),
    evaluatorId: z.string(),
    reasoning: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('EvalResult');

const EvalResultResponseSchema = z
  .object({
    data: EvalResultSchema,
  })
  .openapi('EvalResultResponse');

const EvalResultsListResponseSchema = z
  .object({
    data: z.array(EvalResultSchema),
  })
  .openapi('EvalResultsListResponse');

const CreateEvaluatorRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    prompt: z.string().min(1),
    schema: z.record(z.string(), z.unknown()),
    modelConfig: z.record(z.string(), z.unknown()).optional(),
    id: z.string().optional(),
  })
  .openapi('CreateEvaluatorRequest');

const EvaluatorSchema = z
  .object({
    tenantId: z.string(),
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    prompt: z.string(),
    schema: z.record(z.string(), z.unknown()),
    modelConfig: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Evaluator');

const EvaluatorResponseSchema = z
  .object({
    data: EvaluatorSchema,
  })
  .openapi('EvaluatorResponse');

const EvaluatorsListResponseSchema = z
  .object({
    data: z.array(EvaluatorSchema),
  })
  .openapi('EvaluatorsListResponse');

const UpdateEvaluatorRequestSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    prompt: z.string().optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    modelConfig: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('UpdateEvaluatorRequest');

const ConversationFilterSchema = z
  .object({
    agentIds: z.array(z.string()).optional(),
    projectIds: z.array(z.string()).optional(),
    dateRange: z.object({ startDate: z.string(), endDate: z.string() }).optional(),
    conversationIds: z.array(z.string()).optional(),
  })
  .partial();

const ConversationEvaluationConfigSchema = z
  .object({
    tenantId: z.string(),
    id: z.string(),
    name: z.string(),
    description: z.string(),
    conversationFilter: ConversationFilterSchema.nullable().optional(),
    modelConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    sampleRate: z.number().nullable().optional(),
    isActive: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ConversationEvaluationConfig');

const ConversationEvaluationConfigResponseSchema = z
  .object({
    data: ConversationEvaluationConfigSchema,
  })
  .openapi('ConversationEvaluationConfigResponse');

const ConversationEvaluationConfigListResponseSchema = z
  .object({
    data: z.array(ConversationEvaluationConfigSchema),
  })
  .openapi('ConversationEvaluationConfigListResponse');

const CreateConversationEvaluationConfigRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    conversationFilter: ConversationFilterSchema.optional(),
    modelConfig: z.record(z.string(), z.unknown()).optional(),
    sampleRate: z.number().optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('CreateConversationEvaluationConfigRequest');

const UpdateConversationEvaluationConfigRequestSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    conversationFilter: ConversationFilterSchema.optional(),
    modelConfig: z.record(z.string(), z.unknown()).optional(),
    sampleRate: z.number().optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateConversationEvaluationConfigRequest');

const ConversationEvaluationConfigIdParamsSchema = TenantParamsSchema.extend({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

const DatasetIdParamsSchema = TenantParamsSchema.extend({
  datasetId: z.string().openapi({ param: { name: 'datasetId', in: 'path' } }),
});

const CreateDatasetRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('CreateDatasetRequest');

const UpdateDatasetRequestSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('UpdateDatasetRequest');

const DatasetSchema = z
  .object({
    tenantId: z.string(),
    id: z.string(),
    name: z.string(),
    description: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Dataset');

const DatasetResponseSchema = z
  .object({
    data: DatasetSchema,
  })
  .openapi('DatasetResponse');

const DatasetListResponseSchema = z
  .object({
    data: z.array(DatasetSchema),
  })
  .openapi('DatasetListResponse');

const DatasetItemIdParamsSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

const DatasetItemDatasetIdParamsSchema = z.object({
  datasetId: z.string().openapi({ param: { name: 'datasetId', in: 'path' } }),
});

const MessageContentSchema = z.union([
  z.string(),
  z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      image_url: z.object({ url: z.string() }).optional(),
    })
  ),
]);

const CreateDatasetItemRequestSchema = z
  .object({
    id: z.string().optional(),
    datasetId: z.string(),
    input: z
      .object({
        messages: z.array(
          z.object({
            role: z.string(),
            content: MessageContentSchema,
          })
        ),
        headers: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    expectedOutput: z
      .array(
        z.object({
          role: z.string(),
          content: MessageContentSchema,
        })
      )
      .optional(),
    simulationConfig: z
      .object({
        userPersona: z.string(),
        initialMessage: z.string().optional(),
        maxTurns: z.number().optional(),
        stoppingCondition: z.string().optional(),
        simulatingAgentDefinition: z.object({
          name: z.string(),
          description: z.string(),
          prompt: z.string(),
          model: z.string(),
          temperature: z.number().optional(),
        }),
      })
      .optional(),
  })
  .openapi('CreateDatasetItemRequest');

const UpdateDatasetItemRequestSchema = z
  .object({
    input: z
      .object({
        messages: z.array(
          z.object({
            role: z.string(),
            content: MessageContentSchema,
          })
        ),
        headers: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    expectedOutput: z
      .array(
        z.object({
          role: z.string(),
          content: MessageContentSchema,
        })
      )
      .optional(),
    simulationConfig: z
      .object({
        userPersona: z.string(),
        initialMessage: z.string().optional(),
        maxTurns: z.number().optional(),
        stoppingCondition: z.string().optional(),
        simulatingAgentDefinition: z.object({
          name: z.string(),
          description: z.string(),
          prompt: z.string(),
          model: z.string(),
          temperature: z.number().optional(),
        }),
      })
      .optional(),
  })
  .openapi('UpdateDatasetItemRequest');

const DatasetItemSchema = z
  .object({
    id: z.string(),
    datasetId: z.string(),
    input: z.unknown(),
    expectedOutput: z.unknown().nullable(),
    simulationConfig: z.unknown().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('DatasetItem');

const DatasetItemResponseSchema = z
  .object({
    data: DatasetItemSchema,
  })
  .openapi('DatasetItemResponse');

const DatasetItemListResponseSchema = z
  .object({
    data: z.array(DatasetItemSchema),
  })
  .openapi('DatasetItemListResponse');

const EvalTestSuiteConfigIdParamsSchema = TenantParamsSchema.extend({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

const CreateEvalTestSuiteConfigRequestSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    modelConfig: z.record(z.string(), z.unknown()).optional(),
    runFrequency: z.string().min(1),
  })
  .openapi('CreateEvalTestSuiteConfigRequest');

const UpdateEvalTestSuiteConfigRequestSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    modelConfig: z.record(z.string(), z.unknown()).optional(),
    runFrequency: z.string().optional(),
  })
  .openapi('UpdateEvalTestSuiteConfigRequest');

const EvalTestSuiteConfigSchema = z
  .object({
    tenantId: z.string(),
    id: z.string(),
    name: z.string(),
    description: z.string(),
    modelConfig: z.record(z.string(), z.unknown()).nullable(),
    runFrequency: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('EvalTestSuiteConfig');

const EvalTestSuiteConfigResponseSchema = z
  .object({
    data: EvalTestSuiteConfigSchema,
  })
  .openapi('EvalTestSuiteConfigResponse');

const EvalTestSuiteConfigListResponseSchema = z
  .object({
    data: z.array(EvalTestSuiteConfigSchema),
  })
  .openapi('EvalTestSuiteConfigListResponse');

 
// EVALUATORS
 

// POST /evaluations/evaluators
app.openapi(
  createRoute({
    method: 'post',
    path: '/evaluators',
    summary: 'Create Evaluator',
    operationId: 'create-evaluator',
    tags: ['Evaluations'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: CreateEvaluatorRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluator created',
        content: {
          'application/json': {
            schema: EvaluatorResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const row = await createEvaluator(dbClient)({
        tenantId,
        id: body.id,
        name: body.name,
        description: body.description,
        prompt: body.prompt,
        schema: body.schema,
        modelConfig: body.modelConfig,
      });

      return c.json({ data: row }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, body }, 'Failed to create evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create evaluator' }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/evaluators/{evaluatorId}
app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluators/{evaluatorId}',
    summary: 'Get Evaluator',
    operationId: 'get-evaluator',
    tags: ['Evaluations'],
    request: {
      params: EvaluatorIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Evaluator details',
        content: {
          'application/json': {
            schema: z.object({
              data: z.unknown(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, evaluatorId } = c.req.valid('param');

    try {
      const evaluator = await getEvaluator(dbClient)({ tenantId, evaluatorId });

      if (!evaluator) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }

      return c.json({ data: evaluator }) as any;
    } catch (error) {
      logger.error({ error, tenantId, evaluatorId }, 'Failed to get evaluator');

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluator',
        }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/evaluators
app.openapi(
  createRoute({
    method: 'get',
    path: '/evaluators',
    summary: 'List Evaluators',
    operationId: 'list-evaluators',
    tags: ['Evaluations'],
    request: { params: TenantParamsSchema },
    responses: {
      200: {
        description: 'Evaluators',
        content: { 'application/json': { schema: EvaluatorsListResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const rows = await listEvaluators(dbClient)({ tenantId });
    return c.json({ data: rows }) as any;
  }
);

// PUT /evaluations/evaluators/{evaluatorId}
app.openapi(
  createRoute({
    method: 'put',
    path: '/evaluators/{evaluatorId}',
    summary: 'Update Evaluator',
    operationId: 'update-evaluator',
    tags: ['Evaluations'],
    request: {
      params: EvaluatorIdParamsSchema,
      body: { content: { 'application/json': { schema: UpdateEvaluatorRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Evaluator updated',
        content: { 'application/json': { schema: EvaluatorResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, evaluatorId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const updated = await updateEvaluator(dbClient)({ tenantId, evaluatorId, ...body });
      if (!updated) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }
      return c.json({ data: updated }) as any;
    } catch (error) {
      logger.error({ error, tenantId, evaluatorId, body }, 'Failed to update evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update evaluator' }),
        500
      ) as any;
    }
  }
);

// DELETE /evaluations/evaluators/{evaluatorId}
app.openapi(
  createRoute({
    method: 'delete',
    path: '/evaluators/{evaluatorId}',
    summary: 'Delete Evaluator',
    operationId: 'delete-evaluator',
    tags: ['Evaluations'],
    request: { params: EvaluatorIdParamsSchema },
    responses: {
      204: { description: 'Evaluator deleted' },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, evaluatorId } = c.req.valid('param');
    try {
      const deleted = await deleteEvaluator(dbClient)({ tenantId, evaluatorId });
      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluator not found' }),
          404
        ) as any;
      }
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, tenantId, evaluatorId }, 'Failed to delete evaluator');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete evaluator' }),
        500
      ) as any;
    }
  }
);

// POST /evaluations/configs
app.openapi(
  createRoute({
    method: 'post',
    path: '/configs',
    summary: 'Create Conversation Evaluation Config',
    operationId: 'create-conversation-evaluation-config',
    tags: ['Evaluations'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': { schema: CreateConversationEvaluationConfigRequestSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Config created',
        content: { 'application/json': { schema: ConversationEvaluationConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await createConversationEvaluationConfig(dbClient)({
        tenantId,
        id: body.id,
        name: body.name,
        description: body.description,
        conversationFilter: body.conversationFilter,
        modelConfig: body.modelConfig,
        sampleRate: body.sampleRate,
        isActive: body.isActive,
      });
      return c.json({ data: row }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, body }, 'Failed to create conversation eval config');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create config' }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/configs/{id}
app.openapi(
  createRoute({
    method: 'get',
    path: '/configs/{id}',
    summary: 'Get Conversation Evaluation Config',
    operationId: 'get-conversation-evaluation-config',
    tags: ['Evaluations'],
    request: { params: ConversationEvaluationConfigIdParamsSchema },
    responses: {
      200: {
        description: 'Config',
        content: { 'application/json': { schema: ConversationEvaluationConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    try {
      const row = await getConversationEvaluationConfig(dbClient)({
        tenantId,
        conversationEvaluationConfigId: id,
      });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Config not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to get conversation eval config');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get config' }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/configs
app.openapi(
  createRoute({
    method: 'get',
    path: '/configs',
    summary: 'List Conversation Evaluation Configs',
    operationId: 'list-conversation-evaluation-configs',
    tags: ['Evaluations'],
    request: { params: TenantParamsSchema },
    responses: {
      200: {
        description: 'Configs',
        content: { 'application/json': { schema: ConversationEvaluationConfigListResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    try {
      const rows = await listConversationEvaluationConfigs(dbClient)({ tenantId });
      return c.json({ data: rows }) as any;
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to list conversation eval configs');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list configs' }),
        500
      ) as any;
    }
  }
);

// PUT /evaluations/configs/{id}
app.openapi(
  createRoute({
    method: 'put',
    path: '/configs/{id}',
    summary: 'Update Conversation Evaluation Config',
    operationId: 'update-conversation-evaluation-config',
    tags: ['Evaluations'],
    request: {
      params: ConversationEvaluationConfigIdParamsSchema,
      body: {
        content: {
          'application/json': { schema: UpdateConversationEvaluationConfigRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated config',
        content: { 'application/json': { schema: ConversationEvaluationConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await updateConversationEvaluationConfig(dbClient)({
        tenantId,
        id,
        ...body,
      });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Config not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id, body }, 'Failed to update conversation eval config');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update config' }),
        500
      ) as any;
    }
  }
);

// DELETE /evaluations/configs/{id}
app.openapi(
  createRoute({
    method: 'delete',
    path: '/configs/{id}',
    summary: 'Delete Conversation Evaluation Config',
    operationId: 'delete-conversation-evaluation-config',
    tags: ['Evaluations'],
    request: { params: ConversationEvaluationConfigIdParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    try {
      const row = await deleteConversationEvaluationConfig(dbClient)({ tenantId, id });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Config not found' }),
          404
        ) as any;
      }
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to delete conversation eval config');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete config' }),
        500
      ) as any;
    }
  }
);

// POST /evaluations/configs/{id}/start
app.openapi(
  createRoute({
    method: 'post',
    path: '/configs/{id}/start',
    summary: 'Start Conversation Evaluation Config',
    operationId: 'start-conversation-evaluation-config',
    tags: ['Evaluations'],
    request: { params: ConversationEvaluationConfigIdParamsSchema },
    responses: {
      200: {
        description: 'Started',
        content: { 'application/json': { schema: ConversationEvaluationConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    try {
      const row = await startConversationEvaluationConfig(dbClient)({ tenantId, id });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Config not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to start conversation eval config');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to start config' }),
        500
      ) as any;
    }
  }
);

// POST /evaluations/configs/{id}/stop
app.openapi(
  createRoute({
    method: 'post',
    path: '/configs/{id}/stop',
    summary: 'Stop Conversation Evaluation Config',
    operationId: 'stop-conversation-evaluation-config',
    tags: ['Evaluations'],
    request: { params: ConversationEvaluationConfigIdParamsSchema },
    responses: {
      200: {
        description: 'Stopped',
        content: { 'application/json': { schema: ConversationEvaluationConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    try {
      const row = await stopConversationEvaluationConfig(dbClient)({ tenantId, id });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Config not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to stop conversation eval config');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to stop config' }),
        500
      ) as any;
    }
  }
);

 
// DATASETS
 

// POST /evaluations/datasets
app.openapi(
  createRoute({
    method: 'post',
    path: '/datasets',
    summary: 'Create Dataset',
    operationId: 'create-dataset',
    tags: ['Evaluations'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': { schema: CreateDatasetRequestSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Dataset created',
        content: { 'application/json': { schema: DatasetResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await createDataset(dbClient)({
        tenantId,
        id: body.id,
        name: body.name,
        description: body.description,
        metadata: body.metadata,
      });
      return c.json({ data: row }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, body }, 'Failed to create dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create dataset' }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/datasets/{datasetId}
app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets/{datasetId}',
    summary: 'Get Dataset',
    operationId: 'get-dataset',
    tags: ['Evaluations'],
    request: { params: DatasetIdParamsSchema },
    responses: {
      200: {
        description: 'Dataset',
        content: { 'application/json': { schema: DatasetResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, datasetId } = c.req.valid('param');
    try {
      const row = await getDataset(dbClient)({ tenantId, datasetId });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, datasetId }, 'Failed to get dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get dataset' }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/datasets
app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets',
    summary: 'List Datasets',
    operationId: 'list-datasets',
    tags: ['Evaluations'],
    request: { params: TenantParamsSchema },
    responses: {
      200: {
        description: 'Datasets',
        content: { 'application/json': { schema: DatasetListResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    try {
      const rows = await listDatasets(dbClient)({ tenantId });
      return c.json({ data: rows }) as any;
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to list datasets');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list datasets' }),
        500
      ) as any;
    }
  }
);

// PUT /evaluations/datasets/{datasetId}
app.openapi(
  createRoute({
    method: 'put',
    path: '/datasets/{datasetId}',
    summary: 'Update Dataset',
    operationId: 'update-dataset',
    tags: ['Evaluations'],
    request: {
      params: DatasetIdParamsSchema,
      body: { content: { 'application/json': { schema: UpdateDatasetRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Updated dataset',
        content: { 'application/json': { schema: DatasetResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, datasetId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await updateDataset(dbClient)({
        tenantId,
        datasetId,
        ...body,
      });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, datasetId, body }, 'Failed to update dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update dataset' }),
        500
      ) as any;
    }
  }
);

// DELETE /evaluations/datasets/{datasetId}
app.openapi(
  createRoute({
    method: 'delete',
    path: '/datasets/{datasetId}',
    summary: 'Delete Dataset',
    operationId: 'delete-dataset',
    tags: ['Evaluations'],
    request: { params: DatasetIdParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, datasetId } = c.req.valid('param');
    try {
      const row = await deleteDataset(dbClient)({ tenantId, datasetId });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset not found' }),
          404
        ) as any;
      }
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, tenantId, datasetId }, 'Failed to delete dataset');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete dataset' }),
        500
      ) as any;
    }
  }
);


// DATASET ITEMS

// POST /evaluations/datasets/{datasetId}/items
app.openapi(
  createRoute({
    method: 'post',
    path: '/datasets/{datasetId}/items',
    summary: 'Create Dataset Item',
    operationId: 'create-dataset-item',
    tags: ['Evaluations'],
    request: {
      params: DatasetItemDatasetIdParamsSchema,
      body: {
        content: {
          'application/json': { schema: CreateDatasetItemRequestSchema.omit({ datasetId: true }) },
        },
      },
    },
    responses: {
      201: {
        description: 'Dataset item created',
        content: { 'application/json': { schema: DatasetItemResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { datasetId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await createDatasetItem(dbClient)({
        id: body.id,
        datasetId,
        input: body.input as any,
        expectedOutput: body.expectedOutput as any,
        simulationConfig: body.simulationConfig as any,
      });
      return c.json({ data: row }, 201) as any;
    } catch (error) {
      logger.error({ error, datasetId, body }, 'Failed to create dataset item');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to create dataset item' }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/datasets/{datasetId}/items
app.openapi(
  createRoute({
    method: 'get',
    path: '/datasets/{datasetId}/items',
    summary: 'List Dataset Items',
    operationId: 'list-dataset-items',
    tags: ['Evaluations'],
    request: { params: DatasetItemDatasetIdParamsSchema },
    responses: {
      200: {
        description: 'Dataset items',
        content: { 'application/json': { schema: DatasetItemListResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { datasetId } = c.req.valid('param');
    try {
      const rows = await listDatasetItems(dbClient)({ datasetId });
      return c.json({ data: rows }) as any;
    } catch (error) {
      logger.error({ error, datasetId }, 'Failed to list dataset items');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to list dataset items' }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/dataset-items/{id}
app.openapi(
  createRoute({
    method: 'get',
    path: '/dataset-items/{id}',
    summary: 'Get Dataset Item',
    operationId: 'get-dataset-item',
    tags: ['Evaluations'],
    request: { params: DatasetItemIdParamsSchema },
    responses: {
      200: {
        description: 'Dataset item',
        content: { 'application/json': { schema: DatasetItemResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    try {
      const row = await getDatasetItem(dbClient)({ id });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset item not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, id }, 'Failed to get dataset item');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to get dataset item' }),
        500
      ) as any;
    }
  }
);

// PUT /evaluations/dataset-items/{id}
app.openapi(
  createRoute({
    method: 'put',
    path: '/dataset-items/{id}',
    summary: 'Update Dataset Item',
    operationId: 'update-dataset-item',
    tags: ['Evaluations'],
    request: {
      params: DatasetItemIdParamsSchema,
      body: { content: { 'application/json': { schema: UpdateDatasetItemRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Updated dataset item',
        content: { 'application/json': { schema: DatasetItemResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await updateDatasetItem(dbClient)({
        id,
        input: body.input as any,
        expectedOutput: body.expectedOutput as any,
        simulationConfig: body.simulationConfig as any,
      });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset item not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, id, body }, 'Failed to update dataset item');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to update dataset item' }),
        500
      ) as any;
    }
  }
);

// DELETE /evaluations/dataset-items/{id}
app.openapi(
  createRoute({
    method: 'delete',
    path: '/dataset-items/{id}',
    summary: 'Delete Dataset Item',
    operationId: 'delete-dataset-item',
    tags: ['Evaluations'],
    request: { params: DatasetItemIdParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    try {
      const row = await deleteDatasetItem(dbClient)({ id });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Dataset item not found' }),
          404
        ) as any;
      }
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete dataset item');
      return c.json(
        createApiError({ code: 'internal_server_error', message: 'Failed to delete dataset item' }),
        500
      ) as any;
    }
  }
);

 
// TEST SUITE CONFIGS
 

// POST /evaluations/test-suite-configs
app.openapi(
  createRoute({
    method: 'post',
    path: '/test-suite-configs',
    summary: 'Create Eval Test Suite Config',
    operationId: 'create-eval-test-suite-config',
    tags: ['Evaluations'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': { schema: CreateEvalTestSuiteConfigRequestSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Test suite config created',
        content: { 'application/json': { schema: EvalTestSuiteConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await createEvalTestSuiteConfig(dbClient)({
        tenantId,
        id: body.id,
        name: body.name,
        description: body.description,
        modelConfig: body.modelConfig,
        runFrequency: body.runFrequency,
      });
      return c.json({ data: row }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, body }, 'Failed to create test suite config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create test suite config',
        }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/test-suite-configs/{id}
app.openapi(
  createRoute({
    method: 'get',
    path: '/test-suite-configs/{id}',
    summary: 'Get Eval Test Suite Config',
    operationId: 'get-eval-test-suite-config',
    tags: ['Evaluations'],
    request: { params: EvalTestSuiteConfigIdParamsSchema },
    responses: {
      200: {
        description: 'Test suite config',
        content: { 'application/json': { schema: EvalTestSuiteConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    try {
      const row = await getEvalTestSuiteConfig(dbClient)({ tenantId, evalTestSuiteConfigId: id });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Test suite config not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to get test suite config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get test suite config',
        }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/test-suite-configs
app.openapi(
  createRoute({
    method: 'get',
    path: '/test-suite-configs',
    summary: 'List Eval Test Suite Configs',
    operationId: 'list-eval-test-suite-configs',
    tags: ['Evaluations'],
    request: { params: TenantParamsSchema },
    responses: {
      200: {
        description: 'Test suite configs',
        content: { 'application/json': { schema: EvalTestSuiteConfigListResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    try {
      const rows = await listEvalTestSuiteConfigs(dbClient)({ tenantId });
      return c.json({ data: rows }) as any;
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to list test suite configs');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to list test suite configs',
        }),
        500
      ) as any;
    }
  }
);

// PUT /evaluations/test-suite-configs/{id}
app.openapi(
  createRoute({
    method: 'put',
    path: '/test-suite-configs/{id}',
    summary: 'Update Eval Test Suite Config',
    operationId: 'update-eval-test-suite-config',
    tags: ['Evaluations'],
    request: {
      params: EvalTestSuiteConfigIdParamsSchema,
      body: { content: { 'application/json': { schema: UpdateEvalTestSuiteConfigRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Updated test suite config',
        content: { 'application/json': { schema: EvalTestSuiteConfigResponseSchema } },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await updateEvalTestSuiteConfig(dbClient)({
        tenantId,
        id,
        ...body,
      });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Test suite config not found' }),
          404
        ) as any;
      }
      return c.json({ data: row }) as any;
    } catch (error) {
      logger.error({ error, tenantId, id, body }, 'Failed to update test suite config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update test suite config',
        }),
        500
      ) as any;
    }
  }
);

// DELETE /evaluations/test-suite-configs/{id}
app.openapi(
  createRoute({
    method: 'delete',
    path: '/test-suite-configs/{id}',
    summary: 'Delete Eval Test Suite Config',
    operationId: 'delete-eval-test-suite-config',
    tags: ['Evaluations'],
    request: { params: EvalTestSuiteConfigIdParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, id } = c.req.valid('param');
    try {
      const row = await deleteEvalTestSuiteConfig(dbClient)({ tenantId, id });
      if (!row) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Test suite config not found' }),
          404
        ) as any;
      }
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, tenantId, id }, 'Failed to delete test suite config');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete test suite config',
        }),
        500
      ) as any;
    }
  }
);

 
// RUN OPERATIONS
 

// POST /evaluations/conversations/run
app.openapi(
  createRoute({
    method: 'post',
    path: '/conversations/run',
    summary: 'Run Conversation Evaluation',
    operationId: 'run-conversation-evaluation',
    tags: ['Evaluations'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: RunConversationEvaluationRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation results',
        content: {
          'application/json': {
            schema: EvalResultsListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const { conversationEvaluationConfigId } = c.req.valid('json');

    try {
      const results = await runConversationEvaluation(dbClient)({
        scopes: { tenantId },
        conversationEvaluationConfigId,
      });

      return c.json({ data: results }) as any;
    } catch (error) {
      logger.error(
        {
          error,
          tenantId,
          conversationEvaluationConfigId,
        },
        'Failed to run conversation evaluation'
      );

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to run conversation evaluation';

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: errorMessage,
        }),
        500
      ) as any;
    }
  }
);

// POST /evaluations/datasets/run
app.openapi(
  createRoute({
    method: 'post',
    path: '/datasets/run',
    summary: 'Run Dataset Evaluation',
    operationId: 'run-dataset-evaluation',
    tags: ['Evaluations'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: RunDatasetEvalRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation results',
        content: {
          'application/json': {
            schema: EvalResultsListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const { testSuiteConfigId, datasetId, agentId, evaluatorIds } = c.req.valid('json');

    try {
      const results = await runDatasetEval(dbClient)({
        scopes: { tenantId },
        testSuiteConfigId,
        datasetId,
        agentId,
        evaluatorIds,
      });

      return c.json({ data: results }) as any;
    } catch (error) {
      logger.error(
        {
          error,
          tenantId,
          testSuiteConfigId,
          datasetId,
          agentId,
          evaluatorIds,
        },
        'Failed to run dataset evaluation'
      );

      const errorMessage = error instanceof Error ? error.message : 'Failed to run dataset evaluation';

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: errorMessage,
        }),
        500
      ) as any;
    }
  }
);

 
// EVALUATION RESULTS
 

// POST /evaluations/results
app.openapi(
  createRoute({
    method: 'post',
    path: '/results',
    summary: 'Create Evaluation Result',
    operationId: 'create-eval-result',
    tags: ['Evaluations'],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: CreateEvalResultRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Evaluation result created',
        content: {
          'application/json': {
            schema: EvalResultResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const resultData = c.req.valid('json');

    try {
      // Fetch conversation to get projectId
      const conversation = await dbClient.query.conversations.findFirst({
        where: and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.id, resultData.conversationId)
        ),
      });

      if (!conversation) {
        throw createApiError({ code: 'not_found', message: 'Conversation not found' });
      }

      const result = await createEvalResult(dbClient)({
        tenantId,
        projectId: conversation.projectId,
        conversationId: resultData.conversationId,
        evaluatorId: resultData.evaluatorId,
        status: resultData.status,
        reasoning: resultData.reasoning,
        metadata: resultData.metadata,
        suiteRunId: resultData.suiteRunId,
        datasetItemId: resultData.datasetItemId,
      });

      logger.info({ tenantId, resultId: result.id }, 'Evaluation result created');

      return c.json({ data: result }, 201) as any;
    } catch (error) {
      logger.error({ error, tenantId, resultData }, 'Failed to create evaluation result');

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to create evaluation result',
        }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/results/{id}
app.openapi(
  createRoute({
    method: 'get',
    path: '/results/{id}',
    summary: 'Get Evaluation Result by ID',
    operationId: 'get-eval-result-by-id',
    tags: ['Evaluations'],
    request: {
      params: EvalResultIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Evaluation result',
        content: {
          'application/json': {
            schema: EvalResultResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const result = await getEvalResult(dbClient)({ id });
      if (!result) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        ) as any;
      }
      return c.json({ data: result }) as any;
    } catch (error) {
      logger.error({ error, id }, 'Failed to get evaluation result');
      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation result',
        }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/results/conversation/{conversationId}
app.openapi(
  createRoute({
    method: 'get',
    path: '/results/conversation/{conversationId}',
    summary: 'Get Evaluation Results by Conversation',
    operationId: 'get-eval-results-by-conversation',
    tags: ['Evaluations'],
    request: {
      params: ConversationIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Evaluation results',
        content: {
          'application/json': {
            schema: EvalResultsListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { conversationId } = c.req.valid('param');

    try {
      const results = await getEvalResultsByConversation(dbClient)({
        conversationId,
      });

      return c.json({ data: results }) as any;
    } catch (error) {
      logger.error({ error, conversationId }, 'Failed to get evaluation results');

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation results',
        }),
        500
      ) as any;
    }
  }
);

// GET /evaluations/results/evaluator/{evaluatorId}
app.openapi(
  createRoute({
    method: 'get',
    path: '/results/evaluator/{evaluatorId}',
    summary: 'Get Evaluation Results by Evaluator',
    operationId: 'get-eval-results-by-evaluator',
    tags: ['Evaluations'],
    request: {
      params: EvaluatorIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Evaluation results',
        content: {
          'application/json': {
            schema: EvalResultsListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, evaluatorId } = c.req.valid('param');

    try {
      const results = await getEvalResultsByEvaluator(dbClient)({
        evaluatorId,
      });

      return c.json({ data: results }) as any;
    } catch (error) {
      logger.error({ error, tenantId, evaluatorId }, 'Failed to get evaluation results');

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get evaluation results',
        }),
        500
      ) as any;
    }
  }
);

// PATCH /evaluations/results/{id}
app.openapi(
  createRoute({
    method: 'patch',
    path: '/results/{id}',
    summary: 'Update Evaluation Result',
    operationId: 'update-eval-result',
    tags: ['Evaluations'],
    request: {
      params: EvalResultIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateEvalResultRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Evaluation result updated',
        content: {
          'application/json': {
            schema: EvalResultResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const updateData = c.req.valid('json');

    try {
      if (!updateData.status) {
        return c.json(
          createApiError({
            code: 'bad_request',
            message: 'Status is required for update',
          }),
          400
        ) as any;
      }

      const result = await updateEvalResult(dbClient)({
        id,
        status: updateData.status,
        reasoning: updateData.reasoning,
        metadata: updateData.metadata,
      });

      logger.info({ resultId: id }, 'Evaluation result updated');

      return c.json({ data: result }) as any;
    } catch (error) {
      logger.error({ error, id, updateData }, 'Failed to update evaluation result');

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to update evaluation result',
        }),
        500
      ) as any;
    }
  }
);

// DELETE /evaluations/results/{id}
app.openapi(
  createRoute({
    method: 'delete',
    path: '/results/{id}',
    summary: 'Delete Evaluation Result',
    operationId: 'delete-eval-result',
    tags: ['Evaluations'],
    request: {
      params: EvalResultIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Evaluation result deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const deleted = await deleteEvalResult(dbClient)({ id });

      if (!deleted) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Evaluation result not found' }),
          404
        ) as any;
      }

      logger.info({ resultId: id }, 'Evaluation result deleted');
      return c.body(null, 204);
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete evaluation result');

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to delete evaluation result',
        }),
        500
      ) as any;
    }
  }
);

 
// CONVERSATIONS (Helper)
 

// GET /evaluations/conversations/{conversationId}
app.openapi(
  createRoute({
    method: 'get',
    path: '/conversations/{conversationId}',
    summary: 'Get Conversation for Evaluation',
    operationId: 'get-conversation-for-evaluation',
    tags: ['Evaluations'],
    request: {
      params: ConversationIdParamsSchema.extend({
        projectId: z.string().openapi({ param: { name: 'projectId', in: 'path' } }),
      }),
    },
    responses: {
      200: {
        description: 'Conversation details',
        content: {
          'application/json': {
            schema: z.object({
              data: z.unknown(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, conversationId } = c.req.valid('param');

    try {
      const conversation = await getConversation(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conversation) {
        return c.json(
          createApiError({ code: 'not_found', message: 'Conversation not found' }),
          404
        ) as any;
      }

      return c.json({ data: conversation }) as any;
    } catch (error) {
      logger.error({ error, tenantId, projectId, conversationId }, 'Failed to get conversation');

      return c.json(
        createApiError({
          code: 'internal_server_error',
          message: 'Failed to get conversation',
        }),
        500
      ) as any;
    }
  }
);

export default app;


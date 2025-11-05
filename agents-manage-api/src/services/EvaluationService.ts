import { openai } from '@ai-sdk/openai';
import type { DatabaseClient, FullAgentDefinition, ModelSettings } from '@inkeep/agents-core';
import {
  agents,
  createEvalResult,
  getAgentIdFromConversation,
  getConversationEvaluationConfig,
  getConversationHistory,
  getConversationsForEvaluation,
  getDataset,
  getEvaluatorsForConfig,
  getFullAgent,
  jsonSchemaToZod,
  listDatasetItems,
  updateEvalResult,
} from '@inkeep/agents-core';
import type { LanguageModel } from 'ai';
import { generateObject, generateText } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('EvaluationService');

interface ActivityItem {
  id?: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface ConversationDetail {
  conversationId: string;
  traceId?: string;
  agentId?: string;
  agentName?: string;
  conversationStartTime?: string | null;
  conversationEndTime?: string | null;
  duration: number;
  activities?: ActivityItem[];
  [key: string]: unknown;
}

interface PrettifiedTrace {
  metadata: {
    conversationId: string;
    traceId?: string;
    agentId?: string;
    agentName?: string;
    exportedAt: string;
  };
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  timeline: Array<Record<string, unknown>>;
}

export interface EvalInput {
  agentDefinition: FullAgentDefinition;
  conversationHistory: Array<{
    role: string;
    content: any;
    [key: string]: unknown;
  }>;
  trace: PrettifiedTrace;
}

function formatConversationAsPrettifiedTrace(conversation: ConversationDetail): PrettifiedTrace {
  const trace: PrettifiedTrace = {
    metadata: {
      conversationId: conversation.conversationId,
      traceId: conversation.traceId,
      agentName: conversation.agentName,
      agentId: conversation.agentId,
      exportedAt: new Date().toISOString(),
    },
    timing: {
      startTime: conversation.conversationStartTime || '',
      endTime: conversation.conversationEndTime || '',
      durationMs: conversation.duration,
    },
    timeline: (conversation.activities || []).map((activity) => {
      const { id: _id, ...rest } = activity;
      return {
        ...rest,
      };
    }),
  };

  return trace;
}

async function fetchTraceFromSigNoz(conversationId: string): Promise<PrettifiedTrace | null> {
  const manageUIUrl = env.AGENTS_MANAGE_UI_URL;

  try {
    logger.debug({ conversationId, manageUIUrl }, 'Fetching trace from SigNoz');

    const traceResponse = await fetch(`${manageUIUrl}/api/signoz/conversations/${conversationId}`);

    if (!traceResponse.ok) {
      logger.warn(
        { conversationId, status: traceResponse.status, statusText: traceResponse.statusText },
        'Failed to fetch trace from SigNoz'
      );
      return null;
    }

    const conversationDetail = (await traceResponse.json()) as ConversationDetail;

    logger.debug(
      { conversationId, activityCount: conversationDetail.activities?.length || 0 },
      'Trace fetched successfully'
    );

    const prettifiedTrace = formatConversationAsPrettifiedTrace(conversationDetail);
    return prettifiedTrace;
  } catch (error) {
    logger.warn(
      { error, conversationId, manageUIUrl },
      'Failed to fetch trace from SigNoz, will continue without trace'
    );
    return null;
  }
}

interface RunConversationEvaluationParams {
  scopes: { tenantId: string };
  conversationEvaluationConfigId: string;
}

/**
 * Run conversation evaluation based on a conversation evaluation config
 */
export const runConversationEvaluation =
  (db: DatabaseClient) =>
  async (
    params: RunConversationEvaluationParams
  ): Promise<Array<typeof import('@inkeep/agents-core').evalResult.$inferSelect>> => {
    const { scopes, conversationEvaluationConfigId } = params;
    const { tenantId } = scopes;

    logger.info({ tenantId, conversationEvaluationConfigId }, 'Starting conversation evaluation');

    const config = await getConversationEvaluationConfig(db)({
      tenantId,
      conversationEvaluationConfigId,
    });

    if (!config) {
      throw new Error(
        `Conversation evaluation config not found: ${conversationEvaluationConfigId}`
      );
    }

    if (!config.isActive) {
      throw new Error(
        `Conversation evaluation config is not active: ${conversationEvaluationConfigId}`
      );
    }

    const evaluators = await getEvaluatorsForConfig(db)({
      tenantId,
      conversationEvaluationConfigId,
    });

    if (evaluators.length === 0) {
      throw new Error(`No evaluators found for config: ${conversationEvaluationConfigId}`);
    }

    logger.info(
      { tenantId, conversationEvaluationConfigId, evaluatorCount: evaluators.length },
      'Found evaluators for config'
    );

    const conversations = await getConversationsForEvaluation(db)({
      scopes: { tenantId },
      filter: config.conversationFilter ?? undefined,
    });

    logger.info(
      { tenantId, conversationEvaluationConfigId, conversationCount: conversations.length },
      'Found conversations for evaluation'
    );

    let conversationsToEvaluate = conversations;

    if (config.sampleRate && config.sampleRate < 1 && conversations.length > 0) {
      const sampleCount = Math.max(1, Math.floor(conversations.length * config.sampleRate));
      conversationsToEvaluate = conversations.sort(() => Math.random() - 0.5).slice(0, sampleCount);

      logger.info(
        { tenantId, conversationEvaluationConfigId, sampleCount, totalCount: conversations.length },
        'Applied sample rate to conversations'
      );
    }

    const results: Array<typeof import('@inkeep/agents-core').evalResult.$inferSelect> = [];

    for (const conversation of conversationsToEvaluate) {
      for (const evaluator of evaluators) {
        try {
          logger.info(
            { tenantId, conversationId: conversation.id, evaluatorId: evaluator.id },
            'Running evaluation'
          );

          const evalResult = await createEvalResult(db)({
            tenantId,
            projectId: conversation.projectId,
            conversationId: conversation.id,
            evaluatorId: evaluator.id,
            status: 'pending',
          });

          try {
            const evaluationResult = await executeEvaluation(db, {
              conversation,
              evaluator,
              config,
              tenantId,
              projectId: conversation.projectId,
            });

            await updateEvalResult(db)({
              id: evalResult.id,
              status: 'done',
              reasoning: evaluationResult.reasoning,
              metadata: evaluationResult.metadata,
            });

            const updatedResult = await updateEvalResult(db)({
              id: evalResult.id,
              status: 'done',
              reasoning: evaluationResult.reasoning,
              metadata: evaluationResult.metadata,
            });

            if (updatedResult) {
              results.push(updatedResult);
            }

            logger.info(
              {
                tenantId,
                conversationId: conversation.id,
                evaluatorId: evaluator.id,
                resultId: evalResult.id,
              },
              'Evaluation completed successfully'
            );
          } catch (error) {
            logger.error(
              {
                error,
                tenantId,
                conversationId: conversation.id,
                evaluatorId: evaluator.id,
                resultId: evalResult.id,
              },
              'Evaluation execution failed'
            );

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await updateEvalResult(db)({
              id: evalResult.id,
              status: 'failed',
              reasoning: `Evaluation failed: ${errorMessage}`,
              metadata: { error: errorMessage },
            });

            const failedResult = await updateEvalResult(db)({
              id: evalResult.id,
              status: 'failed',
              reasoning: `Evaluation failed: ${errorMessage}`,
              metadata: { error: errorMessage },
            });

            if (failedResult) {
              results.push(failedResult);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorDetails =
            error && typeof error === 'object' && 'cause' in error
              ? (error.cause as { message?: string; code?: string })
              : null;
          logger.error(
            {
              error: {
                message: errorMessage,
                details: errorDetails,
                fullError: error,
              },
              tenantId,
              conversationId: conversation.id,
              evaluatorId: evaluator.id,
            },
            'Failed to create or update eval result'
          );
        }
      }
    }

    logger.info(
      { tenantId, conversationEvaluationConfigId, resultCount: results.length },
      'Conversation evaluation completed'
    );

    return results;
  };

interface ExecuteEvaluationParams {
  conversation: typeof import('@inkeep/agents-core').conversations.$inferSelect;
  evaluator: typeof import('@inkeep/agents-core').evaluator.$inferSelect;
  config: typeof import('@inkeep/agents-core').conversationEvaluationConfig.$inferSelect;
  tenantId: string;
  projectId: string;
}

interface EvaluationResult {
  reasoning: string;
  metadata: Record<string, unknown>;
}

/**
 * Execute an evaluation by calling the LLM with the evaluator prompt and conversation data
 * Now includes agent definition and optionally trace in the evaluation context
 */
async function executeEvaluation(
  db: DatabaseClient,
  params: ExecuteEvaluationParams
): Promise<EvaluationResult> {
  const { conversation, evaluator, config, tenantId, projectId } = params;

  const conversationHistory = await getConversationHistory(db)({
    scopes: { tenantId, projectId },
    conversationId: conversation.id,
    options: {
      includeInternal: false,
      limit: 100,
    },
  });

  let agentDefinition: FullAgentDefinition | null = null;
  let agentId: string | null = null;

  try {
    agentId = await getAgentIdFromConversation(db)({
      tenantId,
      projectId,
      activeSubAgentId: conversation.activeSubAgentId,
    });

    if (agentId) {
      agentDefinition = await getFullAgent(
        db,
        logger
      )({
        scopes: { tenantId, projectId, agentId },
      });
    }
  } catch (error) {
    logger.warn(
      { error, conversationId: conversation.id, activeSubAgentId: conversation.activeSubAgentId },
      'Failed to fetch agent definition for evaluation'
    );
  }

  const prettifiedTrace = await fetchTraceFromSigNoz(conversation.id);

  const conversationText = JSON.stringify(conversationHistory, null, 2);
  const agentDefinitionText = agentDefinition
    ? JSON.stringify(agentDefinition, null, 2)
    : 'Agent definition not available';
  const traceText = prettifiedTrace
    ? JSON.stringify(prettifiedTrace, null, 2)
    : 'Trace data not available';

  const modelConfig: ModelSettings = (evaluator.modelConfig ??
    config.modelConfig ??
    {}) as ModelSettings;

  const evaluationPrompt = buildEvalInputEvaluationPrompt(
    evaluator.prompt,
    agentDefinitionText,
    conversationText,
    traceText,
    evaluator.schema
  );

  const llmResponse = await callLLM({
    prompt: evaluationPrompt,
    modelConfig,
    schema: evaluator.schema,
  });

  return {
    reasoning: llmResponse.reasoning || 'Evaluation completed',
    metadata: {
      ...llmResponse.result,
      model: 'gpt-4o',
      provider: 'openai',
      conversationMessageCount: conversationHistory.length,
      agentId,
      hasAgentDefinition: !!agentDefinition,
      hasTrace: !!prettifiedTrace,
      traceActivityCount: prettifiedTrace?.timeline.length || 0,
    },
  };
}

/**
 * Get the language model for evaluations
 * Using OpenAI GPT-4o for reliable structured outputs
 */
function getEvaluationModel(_config?: ModelSettings): LanguageModel {
  // TODO: Support configurable models from ModelSettings
  return openai('gpt-4o');
}

interface CallLLMParams {
  prompt: string;
  modelConfig: ModelSettings;
  schema: Record<string, unknown>;
}

interface LLMResponse {
  reasoning: string;
  result: Record<string, unknown>;
}

/**
 * Call LLM API using AI SDK's generateObject for structured output
 */
async function callLLM(params: CallLLMParams): Promise<LLMResponse> {
  const { prompt, modelConfig, schema } = params;

  const languageModel = getEvaluationModel(modelConfig);
  const providerOptions = modelConfig?.providerOptions || {};

  // Convert JSON schema to Zod schema
  const resultSchema = jsonSchemaToZod(schema);

  // Create the evaluation result schema with reasoning
  const evaluationSchema = z.object({
    assessment: resultSchema,
    reasoning: z.string().describe('Detailed reasoning for the evaluation'),
  });

  type EvaluationSchemaType = z.infer<typeof evaluationSchema>;

  try {
    // Try generateObject first - this should work with proper schema
    const result = await generateObject({
      model: languageModel,
      schema: evaluationSchema,
      prompt,
      temperature: (providerOptions.temperature as number) ?? 0.3,
      maxTokens:
        (providerOptions.maxTokens as number) ?? (providerOptions.max_tokens as number) ?? 4096,
    });

    const typedResult = result.object as EvaluationSchemaType;

    return {
      reasoning: typedResult.reasoning,
      result: typedResult.assessment as Record<string, unknown>,
    };
  } catch (error) {
    // Fallback to generateText with JSON parsing if generateObject fails
    // This handles SDK schema conversion bugs
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'generateObject failed, falling back to generateText with JSON parsing'
    );

    const requiredFields = Array.isArray(schema.required) ? schema.required : [];
    const schemaProperties = schema.properties || {};
    
    const promptWithSchema = `${prompt}

IMPORTANT: Return your response as a valid JSON object with this EXACT structure:
{
  "assessment": {
    ${JSON.stringify(schemaProperties, null, 4).split('\n').slice(1, -1).join('\n')}
  },
  "reasoning": "Your detailed reasoning explaining the evaluation"
}

The "assessment" object must contain all required fields: ${requiredFields.join(', ')}.`;

    const result = await generateText({
      model: languageModel,
      prompt: promptWithSchema,
      temperature: (providerOptions.temperature as number) ?? 0.3,
      maxTokens:
        (providerOptions.maxTokens as number) ?? (providerOptions.max_tokens as number) ?? 4096,
    });

    // Clean up the response text (remove markdown code blocks if present)
    const cleanedText = result.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Parse the JSON response
    let parsedResult: any;
    try {
      parsedResult = JSON.parse(cleanedText);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Handle case where LLM returns the schema directly without the wrapper
    // If it has all the assessment fields but no "assessment" wrapper, wrap it
    if (parsedResult.reasoning && !parsedResult.assessment) {
      // Check if it has the assessment fields directly
      const requiredFields = Array.isArray(schema.required) ? schema.required : [];
      const hasAssessmentFields = requiredFields.length > 0 && requiredFields.every((field: string) => field in parsedResult);
      if (hasAssessmentFields) {
        parsedResult = {
          assessment: Object.fromEntries(
            Object.entries(parsedResult).filter(([key]) => key !== 'reasoning')
          ),
          reasoning: parsedResult.reasoning,
        };
      }
    }

    // Validate and return
    const validatedResult = evaluationSchema.parse(parsedResult);

    return {
      reasoning: validatedResult.reasoning,
      result: validatedResult.assessment as Record<string, unknown>,
    };
  }
}

interface RunDatasetEvalParams {
  scopes: { tenantId: string };
  testSuiteConfigId: string;
  datasetId: string;
  agentId: string;
  evaluatorIds: string[];
}

/**
 * Run dataset evaluation based on a test suite config
 *
 * This function:
 * 1. Fetches the test suite config
 * 2. Creates an evalTestSuiteRun record
 * 3. Gets all dataset items from the dataset
 * 4. Gets the evaluators specified
 * 5. For each dataset item:
 *    - Simulates running it through the agent
 *    - Runs each evaluator on the result
 *    - Creates eval results for each evaluation
 */
export const runDatasetEval =
  (db: DatabaseClient) =>
  async (
    params: RunDatasetEvalParams
  ): Promise<Array<typeof import('@inkeep/agents-core').evalResult.$inferSelect>> => {
    const { scopes, testSuiteConfigId, datasetId, agentId, evaluatorIds } = params;
    const { tenantId } = scopes;

    logger.info({ tenantId, testSuiteConfigId, datasetId, agentId }, 'Starting dataset evaluation');

    // Fetch agent to get projectId
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)),
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const projectId = agent.projectId;

    const dataset = await getDataset(db)({ tenantId, datasetId });
    if (!dataset) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }

    const datasetItems = await listDatasetItems(db)({ datasetId });
    if (datasetItems.length === 0) {
      throw new Error(`No dataset items found for dataset: ${datasetId}`);
    }

    logger.info(
      { tenantId, testSuiteConfigId, datasetId, itemCount: datasetItems.length },
      'Found dataset items for evaluation'
    );

    const results: Array<typeof import('@inkeep/agents-core').evalResult.$inferSelect> = [];

    for (const datasetItem of datasetItems) {
      for (const evaluatorId of evaluatorIds) {
        try {
          logger.info(
            { tenantId, datasetItemId: datasetItem.id, evaluatorId },
            'Running dataset item evaluation'
          );

          const evalResult = await createEvalResult(db)({
            tenantId,
            projectId,
            conversationId: `dataset_eval_${datasetItem.id}`,
            evaluatorId,
            status: 'pending',
            datasetItemId: datasetItem.id,
          });

          try {
            const evaluationResult = await executeDatasetItemEvaluation(db, {
              datasetItem,
              evaluatorId,
              tenantId,
            });

            const updatedResult = await updateEvalResult(db)({
              id: evalResult.id,
              status: 'done',
              reasoning: evaluationResult.reasoning,
              metadata: evaluationResult.metadata,
            });

            if (updatedResult) {
              results.push(updatedResult);
            }

            logger.info(
              {
                tenantId,
                datasetItemId: datasetItem.id,
                evaluatorId,
                resultId: evalResult.id,
              },
              'Dataset item evaluation completed successfully'
            );
          } catch (error) {
            logger.error(
              {
                error,
                tenantId,
                datasetItemId: datasetItem.id,
                evaluatorId,
                resultId: evalResult.id,
              },
              'Dataset item evaluation failed'
            );

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const failedResult = await updateEvalResult(db)({
              id: evalResult.id,
              status: 'failed',
              reasoning: `Evaluation failed: ${errorMessage}`,
              metadata: { error: errorMessage },
            });

            if (failedResult) {
              results.push(failedResult);
            }
          }
        } catch (error) {
          logger.error(
            { error, tenantId, datasetItemId: datasetItem.id, evaluatorId },
            'Failed to create or update eval result for dataset item'
          );
        }
      }
    }

    logger.info(
      { tenantId, testSuiteConfigId, datasetId, resultCount: results.length },
      'Dataset evaluation completed'
    );

    return results;
  };

interface ExecuteDatasetItemEvaluationParams {
  datasetItem: typeof import('@inkeep/agents-core').datasetItem.$inferSelect;
  evaluatorId: string;
  tenantId: string;
}

/**
 * Execute an evaluation on a dataset item
 */
async function executeDatasetItemEvaluation(
  db: DatabaseClient,
  params: ExecuteDatasetItemEvaluationParams
): Promise<EvaluationResult> {
  const { datasetItem, evaluatorId, tenantId } = params;

  const evaluator = await db.query.evaluator.findFirst({
    where: (t, { eq, and }) => and(eq(t.tenantId, tenantId), eq(t.id, evaluatorId)),
  });

  if (!evaluator) {
    throw new Error(`Evaluator not found: ${evaluatorId}`);
  }

  const inputText = formatDatasetItemInput(datasetItem);
  const expectedOutputText = formatDatasetItemExpectedOutput(datasetItem);

  const modelConfig: ModelSettings = (evaluator.modelConfig ?? {}) as ModelSettings;

  const evaluationPrompt = buildDatasetItemEvaluationPrompt(
    evaluator.prompt,
    inputText,
    expectedOutputText,
    evaluator.schema
  );

  const llmResponse = await callLLM({
    prompt: evaluationPrompt,
    modelConfig,
    schema: evaluator.schema,
  });

  return {
    reasoning: llmResponse.reasoning || 'Evaluation completed',
    metadata: {
      ...llmResponse.result,
      model: 'gpt-4o',
      provider: 'openai',
      datasetItemId: datasetItem.id,
    },
  };
}

/**
 * Format dataset item input for evaluation prompt
 */
function formatDatasetItemInput(datasetItem: any): string {
  if (!datasetItem.input) {
    return 'No input provided';
  }

  if (typeof datasetItem.input === 'string') {
    return datasetItem.input;
  }

  if (datasetItem.input.messages) {
    return datasetItem.input.messages
      .map((msg: any) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content?.text || JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join('\n\n');
  }

  return JSON.stringify(datasetItem.input, null, 2);
}

/**
 * Format dataset item expected output for evaluation prompt
 */
function formatDatasetItemExpectedOutput(datasetItem: any): string {
  if (!datasetItem.expectedOutput) {
    return 'No expected output provided';
  }

  if (typeof datasetItem.expectedOutput === 'string') {
    return datasetItem.expectedOutput;
  }

  if (Array.isArray(datasetItem.expectedOutput)) {
    return datasetItem.expectedOutput
      .map((msg: any) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content?.text || JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join('\n\n');
  }

  return JSON.stringify(datasetItem.expectedOutput, null, 2);
}

/**
 * Build the evaluation prompt for a dataset item
 */
function buildDatasetItemEvaluationPrompt(
  evaluatorPrompt: string,
  inputText: string,
  expectedOutputText: string,
  schema: Record<string, unknown>
): string {
  const schemaDescription = JSON.stringify(schema, null, 2);

  return `${evaluatorPrompt}

Input:
${inputText}

Expected Output:
${expectedOutputText}

Please evaluate this dataset item according to the following schema and return your evaluation as JSON:
${schemaDescription}

Return your evaluation as a JSON object matching the schema above. Include a "reasoning" field explaining your evaluation.`;
}

function buildEvalInputEvaluationPrompt(
  evaluatorPrompt: string,
  agentDefinitionText: string,
  conversationText: string,
  traceText: string,
  schema: Record<string, unknown>
): string {
  const schemaDescription = JSON.stringify(schema, null, 2);

  return `${evaluatorPrompt}

Agent Definition:
${agentDefinitionText}

Conversation History:
${conversationText}

Execution Trace:
${traceText}

Please evaluate this conversation according to the following schema and return your evaluation as JSON:
${schemaDescription}

Return your evaluation as a JSON object matching the schema above. Include a "reasoning" field explaining your evaluation.`;
}

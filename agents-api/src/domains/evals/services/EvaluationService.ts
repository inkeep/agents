import type {
  ConversationSelect,
  DatasetItemSelect,
  EvaluatorSelect,
  FullAgentDefinition,
  ModelSettings,
  ResolvedRef,
} from '@inkeep/agents-core';
import {
  createEvaluationResult,
  createEvaluationRun,
  type EvaluationResultSelect,
  filterConversationsForJob,
  generateId,
  getConversationHistory,
  getEvaluationJobConfigById,
  getEvaluationJobConfigEvaluatorRelations,
  getEvaluatorById,
  getFullAgent,
  getProjectScopedRef,
  ModelFactory,
  parseSSEResponse,
  resolveRef,
  updateEvaluationResult,
  withRef,
} from '@inkeep/agents-core';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import manageDbClient from '../../../data/db/manageDbClient';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('EvaluationService');

export interface RunDatasetItemOptions {
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetItem: DatasetItemSelect;
  datasetRunId: string;
  conversationId?: string;
  apiKey?: string;
}

export interface ChatApiResponse {
  conversationId?: string;
  response?: string;
  error?: string;
}

/**
 * Service for running dataset items through the chat API endpoint
 */
export class EvaluationService {
  private readonly agentsApiUrl: string | undefined;
  private readonly runApiBypassSecret: string | undefined;

  constructor() {
    this.runApiBypassSecret = env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET ?? undefined;
    this.agentsApiUrl = env.INKEEP_AGENTS_API_URL ?? '';
  }

  /**
   * Run a dataset item through the chat API endpoint
   * Supports multi-turn conversations with simulation agents
   */
  async runDatasetItem(options: RunDatasetItemOptions): Promise<ChatApiResponse> {
    const { tenantId, projectId, agentId, datasetItem, datasetRunId, apiKey } = options;

    try {
      // Extract messages from dataset item input
      const initialMessages = this.extractMessagesFromDatasetItem(datasetItem);
      if (!initialMessages || initialMessages.length === 0) {
        return {
          error: 'Dataset item has no valid input messages',
        };
      }

      // Generate conversation ID
      const finalConversationId = generateId();

      // Check if simulation agent is configured
      const hasSimulationAgent =
        datasetItem.simulationAgent &&
        typeof datasetItem.simulationAgent === 'object' &&
        datasetItem.simulationAgent !== null &&
        !Array.isArray(datasetItem.simulationAgent) &&
        datasetItem.simulationAgent.prompt &&
        datasetItem.simulationAgent.model?.model;

      if (hasSimulationAgent) {
        return await this.runDatasetItemWithSimulation({
          tenantId,
          projectId,
          agentId,
          datasetItem,
          datasetRunId,
          conversationId: finalConversationId,
          apiKey,
          initialMessages,
          simulationAgent: datasetItem.simulationAgent as {
            prompt: string;
            model: { model: string; providerOptions?: Record<string, unknown> };
            stopWhen?: { transferCountIs?: number; stepCountIs?: number };
          },
        });
      }

      // Single-turn conversation (original behavior)
      return await this.runSingleTurn({
        tenantId,
        projectId,
        agentId,
        datasetItem,
        datasetRunId,
        conversationId: finalConversationId,
        apiKey,
        messages: initialMessages,
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          datasetItemId: datasetItem.id,
        },
        'Error running dataset item through chat API'
      );
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Run a single-turn conversation (original behavior)
   */
  private async runSingleTurn(params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    datasetItem: DatasetItemSelect;
    datasetRunId: string;
    conversationId: string;
    apiKey?: string;
    messages: Array<{ role: string; content: unknown }>;
  }): Promise<ChatApiResponse> {
    const {
      tenantId,
      projectId,
      agentId,
      datasetItem,
      datasetRunId,
      conversationId,
      apiKey,
      messages,
    } = params;

    const chatUrl = `${this.agentsApiUrl}/run/api/chat`;
    const chatPayload = {
      messages,
      conversationId,
      stream: true,
    };

    const authToken = apiKey || this.runApiBypassSecret;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
      'x-inkeep-tenant-id': tenantId,
      'x-inkeep-project-id': projectId,
      'x-inkeep-agent-id': agentId,
      // Pass datasetRunId as a header to link this conversation to the dataset run
      // This allows the run-api to find the evaluation job config
      ...(datasetRunId && { 'x-inkeep-dataset-run-id': datasetRunId }),
    };

    logger.info(
      {
        tenantId,
        projectId,
        agentId,
        datasetItemId: datasetItem.id,
        datasetRunId,
        conversationId,
      },
      'Running dataset item through chat API'
    );

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(chatPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          errorText,
          datasetItemId: datasetItem.id,
          conversationId,
        },
        'Chat API request failed'
      );
      return {
        conversationId,
        error: `Chat API error: ${response.status} ${response.statusText}`,
      };
    }

    const responseText = await response.text();
    const parseResult = parseSSEResponse(responseText);

    // Check if the response indicates an error
    if (parseResult.error) {
      logger.error(
        {
          datasetItemId: datasetItem.id,
          conversationId,
          errorMessage: parseResult.error,
        },
        'Chat API returned error operation'
      );
      return {
        conversationId,
        error: parseResult.error,
      };
    }

    logger.info(
      {
        datasetItemId: datasetItem.id,
        conversationId,
        responseLength: parseResult.text?.length || 0,
      },
      'Successfully processed dataset item'
    );

    return {
      conversationId,
      response: parseResult.text,
    };
  }

  /**
   * Run a multi-turn conversation with simulation agent
   */
  private async runDatasetItemWithSimulation(params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    datasetItem: DatasetItemSelect;
    datasetRunId: string;
    conversationId: string;
    apiKey?: string;
    initialMessages: Array<{ role: string; content: unknown }>;
    simulationAgent: {
      prompt: string;
      model: { model: string; providerOptions?: Record<string, unknown> };
      stopWhen?: { transferCountIs?: number; stepCountIs?: number };
    };
  }): Promise<ChatApiResponse> {
    const {
      tenantId,
      projectId,
      agentId,
      datasetItem,
      datasetRunId,
      conversationId,
      apiKey,
      initialMessages,
      simulationAgent,
    } = params;

    logger.info(
      {
        tenantId,
        projectId,
        agentId,
        datasetItemId: datasetItem.id,
        conversationId,
        hasSimulationAgent: true,
        stopWhen: simulationAgent.stopWhen,
      },
      'Running dataset item with simulation agent'
    );

    // Prepare simulation agent model
    const simulationModelConfig = ModelFactory.prepareGenerationConfig(simulationAgent.model);
    const stopWhen = simulationAgent.stopWhen || {};
    const maxSteps = stopWhen.stepCountIs ?? 10; // Default to 10 steps if not specified

    // Track conversation history for simulation agent
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let stepCount = 0;

    // Initial turn: send initial messages to agent under test
    const initialResult = await this.runSingleTurn({
      tenantId,
      projectId,
      agentId,
      datasetItem,
      datasetRunId,
      conversationId,
      apiKey,
      messages: initialMessages,
    });

    if (initialResult.error || !initialResult.response) {
      return initialResult;
    }

    // Add initial exchange to conversation history
    const lastUserMessage = initialMessages
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n');
    conversationHistory.push({ role: 'user', content: lastUserMessage });
    conversationHistory.push({ role: 'assistant', content: initialResult.response });
    stepCount++;

    // Multi-turn loop: simulation agent generates next user message, then agent responds
    // Note: transferCount is not tracked here as we're not doing agent transfers,
    // but we still respect the maxTransfers limit as a safety measure
    while (stepCount < maxSteps) {
      try {
        // Generate next user message using simulation agent
        const simulationPrompt = this.buildSimulationPrompt(
          simulationAgent.prompt,
          conversationHistory
        );

        logger.debug(
          {
            stepCount,
            maxSteps,
            conversationHistoryLength: conversationHistory.length,
          },
          'Generating next user message with simulation agent'
        );

        const simulationResponse = await generateText({
          ...simulationModelConfig,
          prompt: simulationPrompt,
        });

        const nextUserMessage = simulationResponse.text.trim();

        if (!nextUserMessage) {
          logger.warn(
            {
              stepCount,
              datasetItemId: datasetItem.id,
            },
            'Simulation agent returned empty message, stopping conversation'
          );
          break;
        }

        // Add simulation agent's message to conversation history
        conversationHistory.push({ role: 'user', content: nextUserMessage });

        // Send the new user message to the agent under test
        const agentResponse = await this.runSingleTurn({
          tenantId,
          projectId,
          agentId,
          datasetItem,
          datasetRunId,
          conversationId,
          apiKey,
          messages: [{ role: 'user', content: nextUserMessage }],
        });

        if (agentResponse.error || !agentResponse.response) {
          logger.warn(
            {
              stepCount,
              error: agentResponse.error,
              datasetItemId: datasetItem.id,
            },
            'Agent response failed, stopping conversation'
          );
          break;
        }

        // Add agent's response to conversation history
        conversationHistory.push({ role: 'assistant', content: agentResponse.response });
        stepCount++;

        // Check if we should continue (could add more sophisticated logic here)
        // For now, we just check step/transfer limits
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            stepCount,
            datasetItemId: datasetItem.id,
          },
          'Error in simulation agent loop'
        );
        // Continue with existing conversation history even if simulation fails
        break;
      }
    }

    logger.info(
      {
        datasetItemId: datasetItem.id,
        conversationId,
        finalStepCount: stepCount,
        maxSteps,
        conversationHistoryLength: conversationHistory.length,
      },
      'Completed multi-turn conversation with simulation agent'
    );

    // Return the full conversation (last assistant response)
    const finalResponse =
      conversationHistory.filter((m) => m.role === 'assistant').pop()?.content || '';

    return {
      conversationId,
      response: finalResponse,
    };
  }

  /**
   * Build prompt for simulation agent based on persona and conversation history
   */
  private buildSimulationPrompt(
    personaPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    const historyText = conversationHistory
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    return `${personaPrompt}

You are simulating a user in a conversation. Based on the conversation history below, generate the next user message that would naturally follow. Keep your response concise and realistic.

Conversation History:
${historyText}

Generate the next user message:`;
  }

  /**
   * Extract messages from dataset item input
   */
  private extractMessagesFromDatasetItem(
    datasetItem: DatasetItemSelect
  ): Array<{ role: string; content: unknown }> | null {
    if (!datasetItem.input) {
      return null;
    }

    // Valid roles for OpenAI-compatible chat API
    const validRoles = ['system', 'user', 'assistant', 'function', 'tool'] as const;
    type ValidRole = (typeof validRoles)[number];

    // Map UI roles to API roles (UI uses "agent" but API expects "assistant")
    const roleMap: Record<string, ValidRole> = {
      agent: 'assistant',
      user: 'user',
      system: 'system',
      assistant: 'assistant',
      function: 'function',
      tool: 'tool',
    };

    // Handle different input formats
    if (typeof datasetItem.input === 'object' && 'messages' in datasetItem.input) {
      const input = datasetItem.input as { messages: Array<{ role: string; content: unknown }> };
      // Filter and validate message roles - map "agent" to "assistant" and filter invalid roles
      const validMessages = input.messages
        .map((msg) => {
          const mappedRole = roleMap[msg.role.toLowerCase()];
          if (!mappedRole) {
            logger.warn(
              { datasetItemId: datasetItem.id, invalidRole: msg.role },
              'Invalid message role found, skipping message'
            );
            return null;
          }
          return {
            role: mappedRole,
            content: msg.content,
          };
        })
        .filter((msg): msg is { role: ValidRole; content: unknown } => msg !== null);

      if (validMessages.length === 0) {
        logger.warn(
          { datasetItemId: datasetItem.id, totalMessages: input.messages.length },
          'No valid messages found after filtering roles'
        );
        return null;
      }

      return validMessages;
    }

    // Fallback: if input is a string, try to parse it
    if (typeof datasetItem.input === 'string') {
      try {
        const parsed = JSON.parse(datasetItem.input);
        if (parsed.messages && Array.isArray(parsed.messages)) {
          // Apply the same role mapping for parsed messages
          const validMessages = parsed.messages
            .map((msg: { role: string; content: unknown }) => {
              const mappedRole = roleMap[msg.role?.toLowerCase()];
              if (!mappedRole) {
                logger.warn(
                  { datasetItemId: datasetItem.id, invalidRole: msg.role },
                  'Invalid message role found in parsed input, skipping message'
                );
                return null;
              }
              return {
                role: mappedRole,
                content: msg.content,
              };
            })
            .filter((msg: unknown): msg is { role: ValidRole; content: unknown } => msg !== null);

          return validMessages.length > 0 ? validMessages : null;
        }
      } catch {
        // If parsing fails, create a single user message from the string
        return [{ role: 'user', content: datasetItem.input }];
      }
    }

    return null;
  }

  /**
   * Run an evaluation job based on an evaluation job config
   * Filters conversations based on jobFilters and runs evaluations with configured evaluators
   */
  async runEvaluationJob(params: {
    tenantId: string;
    projectId: string;
    evaluationJobConfigId: string;
    sampleRate?: number | null;
  }): Promise<Array<EvaluationResultSelect>> {
    const { tenantId, projectId, evaluationJobConfigId, sampleRate } = params;

    const ref = getProjectScopedRef(tenantId, projectId, 'main');
    const resolvedRef = await resolveRef(manageDbClient)(ref);

    if (!resolvedRef) {
      throw new Error('Failed to resolve ref');
    }

    logger.info(
      { tenantId, projectId, evaluationJobConfigId, sampleRate },
      'Starting evaluation job'
    );

    // Get the evaluation job config
    const config = await withRef(manageDbPool, resolvedRef, (db) =>
      getEvaluationJobConfigById(db)({
        scopes: { tenantId, projectId, evaluationJobConfigId },
      })
    );

    if (!config) {
      throw new Error(`Evaluation job config not found: ${evaluationJobConfigId}`);
    }

    // Get evaluators for this job
    const evaluatorRelations = await withRef(manageDbPool, resolvedRef, (db) =>
      getEvaluationJobConfigEvaluatorRelations(db)({
        scopes: { tenantId, projectId, evaluationJobConfigId },
      })
    );

    if (evaluatorRelations.length === 0) {
      throw new Error(`No evaluators found for job config: ${evaluationJobConfigId}`);
    }

    const evaluators = await Promise.all(
      evaluatorRelations.map((relation) =>
        withRef(manageDbPool, resolvedRef, (db) =>
          getEvaluatorById(db)({
            scopes: { tenantId, projectId, evaluatorId: relation.evaluatorId },
          })
        )
      )
    );

    const validEvaluators = evaluators.filter((e): e is NonNullable<typeof e> => e !== null);

    if (validEvaluators.length === 0) {
      throw new Error(`No valid evaluators found for job config: ${evaluationJobConfigId}`);
    }

    logger.info(
      { tenantId, projectId, evaluationJobConfigId, evaluatorCount: validEvaluators.length },
      'Found evaluators for job config'
    );

    // Filter conversations based on jobFilters
    let conversationsToEvaluate = await filterConversationsForJob(runDbClient)({
      scopes: { tenantId, projectId },
      jobFilters: config.jobFilters,
    });

    // Apply sample rate if provided
    if (sampleRate !== undefined && sampleRate !== null) {
      const originalCount = conversationsToEvaluate.length;
      conversationsToEvaluate = this.applySampleRate(conversationsToEvaluate, sampleRate);
      logger.info(
        {
          tenantId,
          projectId,
          evaluationJobConfigId,
          originalCount,
          sampledCount: conversationsToEvaluate.length,
          sampleRate,
        },
        'Applied sample rate to conversations'
      );
    }

    logger.info(
      {
        tenantId,
        projectId,
        evaluationJobConfigId,
        conversationCount: conversationsToEvaluate.length,
      },
      'Found conversations for evaluation'
    );

    if (conversationsToEvaluate.length === 0) {
      logger.warn(
        { tenantId, projectId, evaluationJobConfigId },
        'No conversations found matching job filters'
      );
      return [];
    }

    // Create evaluation run
    const evaluationRun = await createEvaluationRun(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      evaluationJobConfigId,
    });

    const results: Array<EvaluationResultSelect> = [];

    // Run evaluations for each conversation with each evaluator
    for (const conversation of conversationsToEvaluate) {
      for (const evaluator of validEvaluators) {
        try {
          logger.info(
            { tenantId, conversationId: conversation.id, evaluatorId: evaluator.id },
            'Running evaluation'
          );

          const evalResult = await createEvaluationResult(runDbClient)({
            id: generateId(),
            tenantId,
            projectId,
            conversationId: conversation.id,
            evaluatorId: evaluator.id,
            evaluationRunId: evaluationRun.id,
          });

          try {
            const evaluationResult = await this.executeEvaluation({
              conversation,
              evaluator,
              tenantId,
              projectId,
            });

            const updatedResult = await updateEvaluationResult(runDbClient)({
              scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
              data: {
                output: evaluationResult.output as any,
              },
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
            const failedResult = await updateEvaluationResult(runDbClient)({
              scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
              data: {
                output: { text: `Evaluation failed: ${errorMessage}` } as any,
              },
            });

            if (failedResult) {
              results.push(failedResult);
            }
          }
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              tenantId,
              conversationId: conversation.id,
              evaluatorId: evaluator.id,
            },
            'Failed to create or update eval result'
          );
        }
      }
    }

    // Evaluation run is automatically updated via timestamps when results are created

    logger.info(
      { tenantId, projectId, evaluationJobConfigId, resultCount: results.length },
      'Evaluation job completed'
    );

    return results;
  }

  /**
   * Apply sample rate to conversations
   */
  applySampleRate<T>(items: T[], sampleRate: number | null | undefined): T[] {
    if (!sampleRate || sampleRate >= 1.0) {
      return items;
    }

    if (sampleRate <= 0) {
      return [];
    }

    const targetCount = Math.ceil(items.length * sampleRate);
    const sampled: T[] = [];
    const indices = new Set<number>();

    while (sampled.length < targetCount && sampled.length < items.length) {
      const randomIndex = Math.floor(Math.random() * items.length);
      if (!indices.has(randomIndex)) {
        indices.add(randomIndex);
        sampled.push(items[randomIndex]);
      }
    }

    return sampled;
  }

  /**
   * Execute an evaluation by calling the LLM with the evaluator prompt and conversation data
   */
  async executeEvaluation(params: {
    conversation: ConversationSelect;
    evaluator: EvaluatorSelect;
    tenantId: string;
    projectId: string;
    expectedOutput?: unknown;
  }): Promise<{ output: any; metadata: Record<string, unknown> }> {
    const { conversation, evaluator, tenantId, projectId, expectedOutput } = params;

    let resolvedRef: ResolvedRef | null = null;
    if (conversation.ref) {
      resolvedRef = conversation.ref;
    } else {
      const ref = getProjectScopedRef(tenantId, projectId, 'main');
      resolvedRef = await resolveRef(manageDbClient)(ref);
    }

    if (!resolvedRef) {
      throw new Error('Failed to resolve ref');
    }

    // Get conversation history
    const conversationHistory = await getConversationHistory(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId: conversation.id,
      options: {
        includeInternal: false,
        limit: 100,
      },
    });

    // Get agent definition
    let agentDefinition: FullAgentDefinition | null = null;
    let agentId: string | null = null;

    try {
      // Get agentId from subagent
      agentId = conversation.agentId ?? null;

      if (agentId) {
        const agentIdForLookup = agentId;
        agentDefinition = await withRef(manageDbPool, resolvedRef, (db) =>
          getFullAgent(db)({
            scopes: { tenantId, projectId, agentId: agentIdForLookup },
          })
        );
      } else {
        logger.warn(
          { conversationId: conversation.id, agentId: conversation.agentId },
          'AgentId not found, cannot get agent definition'
        );
      }
    } catch (error) {
      logger.warn(
        { error, conversationId: conversation.id, agentId: conversation.agentId },
        'Failed to fetch agent definition for evaluation'
      );
    }

    // Fetch trace from SigNoz (similar to the example)
    const prettifiedTrace = await this.fetchTraceFromSigNoz(conversation.id);

    logger.info(
      {
        conversationId: conversation.id,
        hasTrace: !!prettifiedTrace,
        traceActivityCount: prettifiedTrace?.timeline?.length || 0,
      },
      'Trace fetch completed'
    );

    const conversationText = JSON.stringify(conversationHistory, null, 2);
    const agentDefinitionText = agentDefinition
      ? JSON.stringify(agentDefinition, null, 2)
      : 'Agent definition not available';
    const traceText = prettifiedTrace
      ? JSON.stringify(prettifiedTrace, null, 2)
      : 'Trace data not available';

    const modelConfig: ModelSettings = (evaluator.model ?? {}) as ModelSettings;

    // Ensure schema is an object (it should be from JSONB, but handle string case)
    let schemaObj: Record<string, unknown>;
    if (typeof evaluator.schema === 'string') {
      try {
        schemaObj = JSON.parse(evaluator.schema);
      } catch (error) {
        logger.error(
          { error, schemaString: evaluator.schema },
          'Failed to parse evaluator schema string'
        );
        throw new Error('Invalid evaluator schema format');
      }
    } else {
      schemaObj = evaluator.schema as Record<string, unknown>;
    }

    logger.info(
      {
        evaluatorId: evaluator.id,
        schemaType: typeof schemaObj,
        schemaKeys: schemaObj && typeof schemaObj === 'object' ? Object.keys(schemaObj) : [],
      },
      'Using evaluator schema'
    );

    const expectedOutputText = expectedOutput ? JSON.stringify(expectedOutput, null, 2) : undefined;

    const evaluationPrompt = this.buildEvalInputEvaluationPrompt(
      evaluator.prompt,
      agentDefinitionText,
      conversationText,
      traceText,
      schemaObj,
      expectedOutputText
    );

    const llmResponse = await this.callLLM({
      prompt: evaluationPrompt,
      modelConfig,
      schema: schemaObj,
    });

    return {
      output: llmResponse.result,
      metadata: {
        ...llmResponse.metadata,
        model: modelConfig.model || 'unknown',
        agentId,
        hasAgentDefinition: !!agentDefinition,
        hasTrace: !!prettifiedTrace,
        traceActivityCount: prettifiedTrace?.timeline?.length || 0,
      },
    };
  }

  /**
   * Build evaluation prompt with agent definition, conversation history, trace, and expected output
   */
  private buildEvalInputEvaluationPrompt(
    evaluatorPrompt: string,
    agentDefinitionText: string,
    conversationText: string,
    traceText: string,
    schema: Record<string, unknown>,
    expectedOutputText?: string
  ): string {
    const schemaDescription = JSON.stringify(schema, null, 2);

    const expectedOutputSection = expectedOutputText
      ? `

Expected Output:

${expectedOutputText}
`
      : '';

    return `${evaluatorPrompt}

Agent Definition:

${agentDefinitionText}

Conversation History:

${conversationText}

Execution Trace:

${traceText}
${expectedOutputSection}
Please evaluate this conversation according to the following schema and return your evaluation as JSON:

${schemaDescription}

Return your evaluation as a JSON object matching the schema above.`;
  }

  /**
   * Call LLM API using AI SDK's generateObject for structured output
   */
  private async callLLM(params: {
    prompt: string;
    modelConfig: ModelSettings;
    schema: Record<string, unknown>;
  }): Promise<{ result: Record<string, unknown>; metadata: Record<string, unknown> }> {
    const { prompt, modelConfig, schema } = params;

    const languageModel = ModelFactory.prepareGenerationConfig(modelConfig);
    const providerOptions = modelConfig?.providerOptions || {};

    // Convert JSON schema to Zod schema
    let resultSchema: z.ZodType<any>;
    try {
      resultSchema = z.fromJSONSchema(schema);
      logger.info(
        {
          schemaType: typeof schema,
          schemaKeys: schema && typeof schema === 'object' ? Object.keys(schema) : [],
          convertedSchema: 'success',
        },
        'Converted JSON schema to Zod'
      );
    } catch (error) {
      logger.error({ error, schema }, 'Failed to convert JSON schema to Zod, using fallback');
      resultSchema = z.record(z.string(), z.unknown());
    }

    // Use the evaluator's schema directly
    const evaluationSchema = resultSchema;

    try {
      // Try generateObject first - this should work with proper schema
      logger.info(
        {
          promptLength: prompt.length,
          model: modelConfig.model,
        },
        'Calling generateObject'
      );
      const result = await generateObject({
        ...languageModel,
        schema: evaluationSchema,
        prompt,
        temperature: (providerOptions.temperature as number) ?? 0.3,
      });

      return {
        result: result.object as Record<string, unknown>,
        metadata: {
          usage: result.usage,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: errorMessage,
          schema: JSON.stringify(schema, null, 2),
          promptPreview: prompt.substring(0, 500),
        },
        'Evaluation failed with generateObject'
      );
      throw new Error(`Evaluation failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch trace from SigNoz (similar to the example)
   */
  private async fetchTraceFromSigNoz(conversationId: string): Promise<any | null> {
    const manageUIUrl = env.INKEEP_AGENTS_MANAGE_UI_URL;
    const maxRetries = 2;
    const retryDelayMs = 20000;
    const initialDelayMs = 30000;

    try {
      logger.info(
        { conversationId, manageUIUrl, initialDelayMs },
        'Waiting 30s before fetching trace from SigNoz'
      );

      await new Promise((resolve) => setTimeout(resolve, initialDelayMs));

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          logger.info(
            { conversationId, attempt: attempt + 1, maxRetries: maxRetries + 1 },
            'Fetching trace from SigNoz'
          );

          const traceResponse = await fetch(
            `${manageUIUrl}/api/signoz/conversations/${conversationId}`
          );

          if (!traceResponse.ok) {
            logger.warn(
              {
                conversationId,
                status: traceResponse.status,
                statusText: traceResponse.statusText,
                attempt: attempt + 1,
              },
              'Failed to fetch trace from SigNoz'
            );

            if (attempt < maxRetries) {
              logger.info({ conversationId, retryDelayMs }, 'Retrying trace fetch after delay');
              await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
              continue;
            }

            return null;
          }

          const conversationDetail = (await traceResponse.json()) as any;

          // Debug: Log activity types to see what we're getting
          logger.debug(
            {
              conversationId,
              activityTypes: conversationDetail.activities?.map((a: any) => a.type) || [],
              activityCount: conversationDetail.activities?.length || 0,
            },
            'Checking activities for ai_assistant_message type'
          );

          const hasAssistantMessage = conversationDetail.activities?.some(
            (activity: any) => activity.type === 'ai_assistant_message'
          );

          if (!hasAssistantMessage) {
            logger.warn(
              {
                conversationId,
                attempt: attempt + 1,
                activityCount: conversationDetail.activities?.length || 0,
                activityTypes:
                  conversationDetail.activities?.slice(0, 5).map((a: any) => a.type) || [],
              },
              'Trace fetched but ai_assistant_message not found in activities'
            );

            if (attempt < maxRetries) {
              logger.info(
                { conversationId, retryDelayMs },
                'Retrying trace fetch after delay to wait for assistant message'
              );
              await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
              continue;
            }

            // Max retries reached - still return the trace we have, just log a warning
            logger.warn(
              {
                conversationId,
                maxRetries,
                activityCount: conversationDetail.activities?.length || 0,
              },
              'Max retries reached, ai_assistant_message not found - proceeding with available trace data'
            );
          } else {
            logger.info(
              {
                conversationId,
                activityCount: conversationDetail.activities?.length || 0,
                attempt: attempt + 1,
              },
              'Trace fetched successfully with ai_assistant_message'
            );
          }

          const prettifiedTrace = this.formatConversationAsPrettifiedTrace(conversationDetail);

          return prettifiedTrace;
        } catch (fetchError) {
          logger.warn(
            { error: fetchError, conversationId, attempt: attempt + 1 },
            'Error fetching trace from SigNoz'
          );

          if (attempt < maxRetries) {
            logger.info({ conversationId, retryDelayMs }, 'Retrying trace fetch after delay');
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            continue;
          }

          return null;
        }
      }

      return null;
    } catch (error) {
      logger.warn(
        { error, conversationId, manageUIUrl },
        'Failed to fetch trace from SigNoz, will continue without trace'
      );
      return null;
    }
  }

  /**
   * Format conversation detail as prettified trace
   */
  private formatConversationAsPrettifiedTrace(conversation: any): any {
    const trace: any = {
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
        durationMs: conversation.duration || 0,
      },
      timeline: (conversation.activities || []).map((activity: any) => {
        const { id: _id, ...rest } = activity;
        return {
          ...rest,
        };
      }),
    };

    return trace;
  }
}

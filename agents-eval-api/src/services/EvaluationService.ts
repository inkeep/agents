import type { DatasetItemSelect, FullAgentDefinition, ModelSettings } from '@inkeep/agents-core';
import {
  conversations,
  createEvaluationResult,
  createEvaluationRun,
  generateId,
  getConversationHistory,
  getDatasetRunConversationRelations,
  getEvaluationJobConfigById,
  getEvaluationJobConfigEvaluatorRelations,
  getEvaluatorById,
  getFullAgent,
  updateEvaluationResult,
} from '@inkeep/agents-core';
import { generateObject, generateText } from 'ai';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { ModelFactory } from '../utils/ModelFactory';

const logger = getLogger('EvaluationService');

/**
 * Converts JSON Schema objects to Zod schema types
 */
function jsonSchemaToZod(jsonSchema: any): z.ZodType<any> {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    logger.warn({ jsonSchema }, 'Invalid JSON schema provided, using string fallback');
    return z.string();
  }

  switch (jsonSchema.type) {
    case 'object':
      if (jsonSchema.properties) {
        const shape: Record<string, z.ZodType<any>> = {};
        const required = jsonSchema.required || [];

        for (const [key, prop] of Object.entries(jsonSchema.properties)) {
          const propSchema = prop as Record<string, unknown>;
          let zodType = jsonSchemaToZod(propSchema);

          // Add description if present
          if (propSchema.description) {
            zodType = zodType.describe(String(propSchema.description));
          }

          // Mark as optional if not in required array
          if (!required.includes(key)) {
            zodType = zodType.optional();
          }

          shape[key] = zodType;
        }
        return z.object(shape);
      }
      return z.record(z.string(), z.unknown());

    case 'array': {
      const itemSchema = jsonSchema.items ? jsonSchemaToZod(jsonSchema.items) : z.unknown();
      let arraySchema = z.array(itemSchema);

      // Apply array constraints
      if (jsonSchema.minItems !== undefined) {
        arraySchema = arraySchema.min(jsonSchema.minItems);
      }
      if (jsonSchema.maxItems !== undefined) {
        arraySchema = arraySchema.max(jsonSchema.maxItems);
      }

      return arraySchema;
    }

    case 'string': {
      // Handle enum first (enum takes precedence)
      if (jsonSchema.enum && Array.isArray(jsonSchema.enum)) {
        const [first, ...rest] = jsonSchema.enum;
        return z.enum([String(first), ...rest.map(String)] as [string, ...string[]]);
      }

      let stringSchema = z.string();

      // Handle minLength/maxLength
      if (jsonSchema.minLength !== undefined) {
        stringSchema = stringSchema.min(jsonSchema.minLength);
      }
      if (jsonSchema.maxLength !== undefined) {
        stringSchema = stringSchema.max(jsonSchema.maxLength);
      }

      return stringSchema;
    }

    case 'number':
    case 'integer': {
      let numberSchema = jsonSchema.type === 'integer' ? z.number().int() : z.number();

      // Handle enum for numbers (use union of literals)
      if (jsonSchema.enum && Array.isArray(jsonSchema.enum)) {
        const enumValues = jsonSchema.enum as number[];
        if (enumValues.length > 0) {
          const [first, ...rest] = enumValues;
          return z.union([z.literal(first), ...rest.map((val) => z.literal(val))] as [
            z.ZodLiteral<number>,
            ...z.ZodLiteral<number>[],
          ]);
        }
      }

      // Apply number constraints
      if (jsonSchema.minimum !== undefined) {
        numberSchema = numberSchema.min(jsonSchema.minimum);
      }
      if (jsonSchema.maximum !== undefined) {
        numberSchema = numberSchema.max(jsonSchema.maximum);
      }

      return numberSchema;
    }

    case 'boolean':
      return z.boolean();

    case 'null':
      return z.null();

    default:
      logger.warn(
        {
          unsupportedType: jsonSchema.type,
          schema: jsonSchema,
        },
        'Unsupported JSON schema type, using unknown validation'
      );
      return z.unknown();
  }
}

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
  private readonly agentsRunApiUrl: string;

  constructor() {
    this.agentsRunApiUrl = env.AGENTS_RUN_API_URL;
  }

  /**
   * Run a dataset item through the chat API endpoint
   * Supports multi-turn conversations with simulation agents
   */
  async runDatasetItem(options: RunDatasetItemOptions): Promise<ChatApiResponse> {
    const {
      tenantId,
      projectId,
      agentId,
      datasetItem,
      datasetRunId,
      conversationId,
      apiKey,
    } = options;

    try {
      // Extract messages from dataset item input
      const initialMessages = this.extractMessagesFromDatasetItem(datasetItem);
      if (!initialMessages || initialMessages.length === 0) {
        return {
          error: 'Dataset item has no valid input messages',
        };
      }

      // Generate conversation ID if not provided (format: eval-timestamp for clarity)
      const finalConversationId = conversationId || `eval-${Date.now()}-${generateId()}`;

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

    const chatUrl = `${this.agentsRunApiUrl}/api/chat`;
    const chatPayload = {
      messages,
      conversationId,
      stream: true,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
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
    const parseResult = this.parseSSEResponse(responseText);

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
   * Parse SSE (Server-Sent Events) response from chat API
   * Handles text deltas, error operations, and other data operations
   */
  private parseSSEResponse(sseText: string): { text: string; error?: string } {
    let textContent = '';
    let hasError = false;
    let errorMessage = '';

    const lines = sseText.split('\n').filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix

        // Handle OpenAI-compatible chat completion chunk format
        if (data.object === 'chat.completion.chunk' && data.choices?.[0]?.delta) {
          const delta = data.choices[0].delta;

          // Extract text content
          if (delta.content) {
            textContent += delta.content;
          }

          // Check for embedded JSON in content (for operations)
          if (delta.content && typeof delta.content === 'string') {
            try {
              const parsedContent = JSON.parse(delta.content);
              if (parsedContent.type === 'data-operation' && parsedContent.data?.type === 'error') {
                hasError = true;
                errorMessage = parsedContent.data.message || 'Unknown error occurred';
                logger.warn(
                  {
                    errorMessage,
                    errorData: parsedContent.data,
                  },
                  'Received error operation from chat API'
                );
              }
            } catch {
              // Not JSON, treat as regular text content
            }
          }
        }
        // Handle Vercel AI SDK data stream format
        else if (data.type === 'text-delta' && data.delta) {
          textContent += data.delta;
        }
        // Handle error operations (like the UI does)
        else if (data.type === 'data-operation' && data.data?.type === 'error') {
          hasError = true;
          errorMessage = data.data.message || 'Unknown error occurred';
          logger.warn(
            {
              errorMessage,
              errorData: data.data,
            },
            'Received error operation from chat API'
          );
        }
        // Handle error type directly
        else if (data.type === 'error') {
          hasError = true;
          errorMessage = data.message || 'Unknown error occurred';
          logger.warn(
            {
              errorMessage,
              errorData: data,
            },
            'Received error event from chat API'
          );
        }
        // Handle other response formats
        else if (data.content) {
          textContent +=
            typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
        }
      } catch {
        // Skip invalid JSON lines (like '[DONE]' or empty lines)
      }
    }

    if (hasError) {
      return {
        text: textContent.trim(),
        error: errorMessage,
      };
    }

    return {
      text: textContent.trim(),
    };
  }

  /**
   * Run an evaluation job based on an evaluation job config
   * Filters conversations based on jobFilters and runs evaluations with configured evaluators
   */
  async runEvaluationJob(params: {
    tenantId: string;
    projectId: string;
    evaluationJobConfigId: string;
  }): Promise<Array<typeof import('@inkeep/agents-core').evaluationResult.$inferSelect>> {
    const { tenantId, projectId, evaluationJobConfigId } = params;

    logger.info({ tenantId, projectId, evaluationJobConfigId }, 'Starting evaluation job');

    // Get the evaluation job config
    const config = await getEvaluationJobConfigById(dbClient)({
      scopes: { tenantId, projectId, evaluationJobConfigId },
    });

    if (!config) {
      throw new Error(`Evaluation job config not found: ${evaluationJobConfigId}`);
    }

    // Get evaluators for this job
    const evaluatorRelations = await getEvaluationJobConfigEvaluatorRelations(dbClient)({
      scopes: { tenantId, projectId, evaluationJobConfigId },
    });

    if (evaluatorRelations.length === 0) {
      throw new Error(`No evaluators found for job config: ${evaluationJobConfigId}`);
    }

    const evaluators = await Promise.all(
      evaluatorRelations.map((relation) =>
        getEvaluatorById(dbClient)({
          scopes: { tenantId, projectId, evaluatorId: relation.evaluatorId },
        })
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
    const conversationsToEvaluate = await this.filterConversationsForJob({
      tenantId,
      projectId,
      jobFilters: config.jobFilters,
    });

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
    const evaluationRun = await createEvaluationRun(dbClient)({
      id: generateId(),
      tenantId,
      projectId,
      evaluationJobConfigId,
    });

    const results: Array<typeof import('@inkeep/agents-core').evaluationResult.$inferSelect> = [];

    // Run evaluations for each conversation with each evaluator
    for (const conversation of conversationsToEvaluate) {
      for (const evaluator of validEvaluators) {
        try {
          logger.info(
            { tenantId, conversationId: conversation.id, evaluatorId: evaluator.id },
            'Running evaluation'
          );

          const evalResult = await createEvaluationResult(dbClient)({
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

            const updatedResult = await updateEvaluationResult(dbClient)({
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
            const failedResult = await updateEvaluationResult(dbClient)({
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
   * Filter conversations based on job filters
   */
  async filterConversationsForJob(params: {
    tenantId: string;
    projectId: string;
    jobFilters: any;
  }): Promise<Array<typeof import('@inkeep/agents-core').conversations.$inferSelect>> {
    const { tenantId, projectId, jobFilters } = params;

    const whereConditions = [
      eq(conversations.tenantId, tenantId),
      eq(conversations.projectId, projectId),
    ];

    // Filter by conversation IDs if specified
    if (
      jobFilters?.conversationIds &&
      Array.isArray(jobFilters.conversationIds) &&
      jobFilters.conversationIds.length > 0
    ) {
      whereConditions.push(inArray(conversations.id, jobFilters.conversationIds));
    }

    // Filter by date range if specified
    if (jobFilters?.dateRange) {
      const { startDate, endDate } = jobFilters.dateRange;
      if (startDate) {
        whereConditions.push(gte(conversations.createdAt, startDate));
      }
      if (endDate) {
        whereConditions.push(lte(conversations.createdAt, endDate));
      }
    }

    // Filter by dataset run IDs if specified
    if (
      jobFilters?.datasetRunIds &&
      Array.isArray(jobFilters.datasetRunIds) &&
      jobFilters.datasetRunIds.length > 0
    ) {
      // Get conversation IDs from dataset run relations
      const allConversationIds = new Set<string>();
      for (const datasetRunId of jobFilters.datasetRunIds) {
        const relations = await getDatasetRunConversationRelations(dbClient)({
          scopes: { tenantId, projectId, datasetRunId },
        });
        for (const relation of relations) {
          allConversationIds.add(relation.conversationId);
        }
      }

      if (allConversationIds.size > 0) {
        whereConditions.push(inArray(conversations.id, Array.from(allConversationIds)));
      } else {
        // No conversations found in dataset runs, return empty array
        return [];
      }
    }

    const filteredConversations = await dbClient
      .select()
      .from(conversations)
      .where(and(...whereConditions));

    return filteredConversations;
  }

  /**
   * Execute an evaluation by calling the LLM with the evaluator prompt and conversation data
   */
  async executeEvaluation(params: {
    conversation: typeof import('@inkeep/agents-core').conversations.$inferSelect;
    evaluator: typeof import('@inkeep/agents-core').evaluator.$inferSelect;
    tenantId: string;
    projectId: string;
  }): Promise<{ output: any; metadata: Record<string, unknown> }> {
    const { conversation, evaluator, tenantId, projectId } = params;

    // Get conversation history
    const conversationHistory = await getConversationHistory(dbClient)({
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
      const activeSubAgentId = conversation.activeSubAgentId;
      if (activeSubAgentId) {
        // Query subagent to get its agentId
        const subAgent = await dbClient.query.subAgents.findFirst({
          where: (subAgents, { eq, and }) =>
            and(
              eq(subAgents.tenantId, tenantId),
              eq(subAgents.projectId, projectId),
              eq(subAgents.id, activeSubAgentId)
            ),
        });

        if (subAgent) {
          agentId = subAgent.agentId;
        } else {
          logger.warn(
            { conversationId: conversation.id, activeSubAgentId },
            'Subagent not found, cannot get agentId'
          );
        }

        if (agentId) {
          agentDefinition = await getFullAgent(
            dbClient,
            logger
          )({
            scopes: { tenantId, projectId, agentId },
          });
        }
      }
    } catch (error) {
      logger.warn(
        { error, conversationId: conversation.id, activeSubAgentId: conversation.activeSubAgentId },
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

    const evaluationPrompt = this.buildEvalInputEvaluationPrompt(
      evaluator.prompt,
      agentDefinitionText,
      conversationText,
      traceText,
      schemaObj
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
        conversationMessageCount: conversationHistory.length,
        agentId,
        hasAgentDefinition: !!agentDefinition,
        hasTrace: !!prettifiedTrace,
        traceActivityCount: prettifiedTrace?.timeline?.length || 0,
      },
    };
  }

  /**
   * Build evaluation prompt with agent definition, conversation history, and trace
   */
  private buildEvalInputEvaluationPrompt(
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
      resultSchema = jsonSchemaToZod(schema);
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
      // Fallback to generateText with JSON parsing if generateObject fails
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.warn(
        {
          error: errorMessage,
          errorDetails: errorStack,
          schema: JSON.stringify(schema, null, 2),
          promptPreview: prompt.substring(0, 500),
        },
        'generateObject failed, falling back to generateText with JSON parsing'
      );

      let textResult: Awaited<ReturnType<typeof generateText>> | undefined;
      try {
        // Enhance prompt to explicitly request JSON format
        const schemaDescription = JSON.stringify(schema, null, 2);
        const enhancedPrompt = `${prompt}

IMPORTANT: You must respond with valid JSON matching this exact schema:
${schemaDescription}

Return ONLY valid JSON, no markdown formatting, no code blocks.`;

        textResult = await generateText({
          ...languageModel,
          prompt: enhancedPrompt,
          temperature: (providerOptions.temperature as number) ?? 0.3,
        });

        logger.info(
          {
            responseLength: textResult.text.length,
            responsePreview: textResult.text.substring(0, 200),
          },
          'Received response from generateText fallback'
        );

        // Try to extract JSON from markdown code blocks if present
        let jsonText = textResult.text.trim();
        const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }

        const parsed = JSON.parse(jsonText);

        // Validate that result has required fields
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Evaluation result is missing or invalid');
        }

        return {
          result: parsed as Record<string, unknown>,
          metadata: {
            usage: textResult.usage,
            fallback: true,
          },
        };
      } catch (fallbackError) {
        logger.error(
          {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            text: textResult?.text?.substring(0, 500),
            originalError: errorMessage,
          },
          'Failed to parse JSON from generateText fallback'
        );
        throw new Error(
          `Evaluation failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
        );
      }
    }
  }

  /**
   * Fetch trace from SigNoz (similar to the example)
   */
  private async fetchTraceFromSigNoz(conversationId: string): Promise<any | null> {
    const manageUIUrl = env.AGENTS_MANAGE_UI_URL;
    const maxRetries = 2;
    const retryDelayMs = 20000;
    const initialDelayMs = 30000;

    try {
      logger.info({ conversationId, manageUIUrl, initialDelayMs }, 'Waiting 30s before fetching trace from SigNoz');
      
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
              { conversationId, status: traceResponse.status, statusText: traceResponse.statusText, attempt: attempt + 1 },
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

          // Debug: Log activity names to see what we're getting
          logger.debug(
            {
              conversationId,
              activityNames: conversationDetail.activities?.map((a: any) => a.name) || [],
              activityCount: conversationDetail.activities?.length || 0,
            },
            'Checking activities for execution_handler.execute span'
          );

          const hasExecutionHandlerSpan = conversationDetail.activities?.some(
            (activity: any) => activity.name === 'execution_handler.execute'
          );

          if (!hasExecutionHandlerSpan) {
            logger.warn(
              { 
                conversationId, 
                attempt: attempt + 1, 
                activityCount: conversationDetail.activities?.length || 0,
                activityNames: conversationDetail.activities?.slice(0, 5).map((a: any) => a.name) || []
              },
              'Trace fetched but execution_handler.execute span not found'
            );

            if (attempt < maxRetries) {
              logger.info(
                { conversationId, retryDelayMs },
                'Retrying trace fetch after delay to wait for span'
              );
              await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
              continue;
            }

            logger.warn(
              { conversationId, maxRetries },
              'Max retries reached, execution_handler.execute span not found'
            );
            return null;
          }

          logger.info(
            { conversationId, activityCount: conversationDetail.activities?.length || 0, attempt: attempt + 1 },
            'Trace fetched successfully with execution_handler.execute span'
          );

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

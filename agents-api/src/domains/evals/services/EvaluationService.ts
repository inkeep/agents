import type {
  ConversationSelect,
  EvaluatorSelect,
  FullAgentDefinition,
  ModelSettings,
  ResolvedRef,
} from '@inkeep/agents-core';
import {
  getConversationHistory,
  getFullAgent,
  getProjectScopedRef,
  ModelFactory,
  resolveRef,
  withRef,
} from '@inkeep/agents-core';
import { generateObject } from 'ai';
import { z } from 'zod';
import manageDbClient from '../../../data/db/manageDbClient';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('EvaluationService');

export class EvaluationService {
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

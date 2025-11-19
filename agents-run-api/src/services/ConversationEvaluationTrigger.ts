import type { FullAgentDefinition, ModelSettings } from '@inkeep/agents-core';
import {
  createEvaluationResult,
  createEvaluationRun,
  deleteEvaluationResult,
  type Filter,
  generateId,
  getConversation,
  getConversationHistory,
  getEvaluationRunConfigById,
  getEvaluationRunConfigEvaluationSuiteConfigRelations,
  getEvaluationSuiteConfigById,
  getEvaluationSuiteConfigEvaluatorRelations,
  getEvaluatorById,
  getFullAgent,
  listEvaluationResultsByConversation,
  listEvaluationRunConfigs,
  updateEvaluationResult,
} from '@inkeep/agents-core';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { ModelFactory } from '../agents/ModelFactory.js';
import dbClient from '../data/db/dbClient.js';
import { env } from '../env.js';
import { getLogger } from '../logger.js';
import { jsonSchemaToZod } from '../utils/data-component-schema.js';

const logger = getLogger('ConversationEvaluationTrigger');

type EvaluationSuiteFilterCriteria = {
  agentIds?: string[];
  [key: string]: unknown;
};

/**
 * Service for triggering evaluations when conversations complete
 */
export class ConversationEvaluationTrigger {
  /**
   * Trigger evaluations for a completed conversation
   * This is called asynchronously after conversation completion
   */
  async triggerEvaluationsForConversation(params: {
    tenantId: string;
    projectId: string;
    conversationId: string;
    specificRunConfigIds?: string[];
  }): Promise<void> {
    const { tenantId, projectId, conversationId, specificRunConfigIds } = params;

    try {
      logger.warn(
        {
          tenantId,
          projectId,
          conversationId,
          specificRunConfigIds,
          isExplicitTrigger: !!specificRunConfigIds && specificRunConfigIds.length > 0,
        },
        '=== TRIGGERING EVALUATIONS FOR CONVERSATION ==='
      );

      // Get the conversation
      const conversation = await getConversation(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conversation) {
        logger.warn({ conversationId }, 'Conversation not found, skipping evaluation trigger');
        return;
      }

      // Get evaluation run configs - either specific ones or all active ones
      let runConfigs: typeof import('@inkeep/agents-core').evaluationRunConfig.$inferSelect[];
      if (specificRunConfigIds && specificRunConfigIds.length > 0) {
        // Deduplicate specificRunConfigIds to prevent processing the same config twice
        const uniqueRunConfigIds = [...new Set(specificRunConfigIds)];

        if (uniqueRunConfigIds.length !== specificRunConfigIds.length) {
          logger.warn(
            {
              originalCount: specificRunConfigIds.length,
              uniqueCount: uniqueRunConfigIds.length,
              conversationId,
            },
            'Duplicate evaluation run config IDs detected in specificRunConfigIds, deduplicating'
          );
        }

        // Get specific run configs (for dataset runs - allow inactive ones to be triggered explicitly)
        const configs = await Promise.all(
          uniqueRunConfigIds.map(async (runConfigId) => {
            const config = await getEvaluationRunConfigById(dbClient)({
              scopes: { tenantId, projectId, evaluationRunConfigId: runConfigId },
            });
            return config;
          })
        );
        // Filter out nulls but allow inactive configs when explicitly specified (for dataset runs)
        // Deduplicate by ID to prevent processing the same config twice
        const configMap = new Map<
          string,
          typeof import('@inkeep/agents-core').evaluationRunConfig.$inferSelect
        >();
        for (const config of configs) {
          if (config === null) continue;
          // Use Map to deduplicate by ID (in case same config was fetched multiple times)
          if (!configMap.has(config.id)) {
            configMap.set(config.id, config);
          }
        }
        runConfigs = Array.from(configMap.values());
      } else {
        // Get all active evaluation run configs for the project (normal conversation completion)
        const allRunConfigs = await listEvaluationRunConfigs(dbClient)({
          scopes: { tenantId, projectId },
        });
        // Filter to only active configs
        runConfigs = allRunConfigs.filter((config) => config.isActive !== false);
      }

      if (runConfigs.length === 0) {
        logger.debug({ tenantId, projectId }, 'No active evaluation run configs found');
        return;
      }

      logger.info(
        {
          tenantId,
          projectId,
          activeRunConfigCount: runConfigs.length,
          isExplicitTrigger: !!(specificRunConfigIds && specificRunConfigIds.length > 0),
          runConfigIds: runConfigs.map((c) => c.id),
          runConfigNames: runConfigs.map((c) => c.name),
        },
        'Found evaluation run configs'
      );

      // Check each run config for matching suite configs
      for (const runConfig of runConfigs) {
        try {
          await this.processRunConfig({
            tenantId,
            projectId,
            conversationId,
            conversation,
            runConfigId: runConfig.id,
          });
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              runConfigId: runConfig.id,
              conversationId,
            },
            'Error processing evaluation run config'
          );
          // Continue with other run configs even if one fails
        }
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          tenantId,
          projectId,
          conversationId,
        },
        'Failed to trigger evaluations for conversation'
      );
      // Don't throw - this is fire-and-forget
    }
  }

  /**
   * Process a single evaluation run config
   */
  private async processRunConfig(params: {
    tenantId: string;
    projectId: string;
    conversationId: string;
    conversation: typeof import('@inkeep/agents-core').conversations.$inferSelect;
    runConfigId: string;
  }): Promise<void> {
    const { tenantId, projectId, conversationId, conversation, runConfigId } = params;

    // Get suite configs linked to this run config
    const suiteConfigRelations = await getEvaluationRunConfigEvaluationSuiteConfigRelations(
      dbClient
    )({
      scopes: { tenantId, projectId, evaluationRunConfigId: runConfigId },
    });

    if (suiteConfigRelations.length === 0) {
      logger.debug({ runConfigId }, 'No suite configs linked to run config');
      return;
    }

    // Check each suite config to see if it matches
    const matchingSuiteConfigs: Array<{
      suiteConfigId: string;
      filters: Filter<EvaluationSuiteFilterCriteria> | null;
      sampleRate: number | null;
    }> = [];

    for (const relation of suiteConfigRelations) {
      const suiteConfig = await getEvaluationSuiteConfigById(dbClient)({
        scopes: { tenantId, projectId, evaluationSuiteConfigId: relation.evaluationSuiteConfigId },
      });

      if (!suiteConfig) {
        logger.warn(
          { suiteConfigId: relation.evaluationSuiteConfigId },
          'Suite config not found, skipping'
        );
        continue;
      }

      // Check if filters match
      const matches = await this.checkSuiteConfigMatch(
        conversation,
        suiteConfig.filters,
        tenantId,
        projectId
      );

      if (matches) {
        // Check sample rate
        if (suiteConfig.sampleRate !== null && suiteConfig.sampleRate !== undefined) {
          const random = Math.random();
          if (random > suiteConfig.sampleRate) {
            logger.debug(
              { suiteConfigId: suiteConfig.id, sampleRate: suiteConfig.sampleRate, random },
              'Conversation filtered out by sample rate'
            );
            continue;
          }
        }

        matchingSuiteConfigs.push({
          suiteConfigId: suiteConfig.id,
          filters: suiteConfig.filters,
          sampleRate: suiteConfig.sampleRate,
        });
      }
    }

    if (matchingSuiteConfigs.length === 0) {
      logger.debug({ runConfigId, conversationId }, 'No matching suite configs found');
      return;
    }

    logger.info(
      { runConfigId, conversationId, matchingSuiteConfigCount: matchingSuiteConfigs.length },
      'Found matching suite configs, creating evaluation run'
    );

    // Create evaluation run
    const evaluationRunId = generateId();
    logger.warn(
      {
        evaluationRunId,
        tenantId,
        projectId,
        evaluationRunConfigId: runConfigId,
        conversationId,
        matchingSuiteConfigCount: matchingSuiteConfigs.length,
      },
      'Creating evaluation run'
    );

    const evaluationRun = await createEvaluationRun(dbClient)({
      id: evaluationRunId,
      tenantId,
      projectId,
      evaluationRunConfigId: runConfigId,
    });

    logger.warn(
      {
        id: evaluationRun.id,
        evaluationRunConfigId: evaluationRun.evaluationRunConfigId,
        tenantId: evaluationRun.tenantId,
        projectId: evaluationRun.projectId,
      },
      'Evaluation run created'
    );

    // Execute evaluations for each matching suite config
    for (const matchingSuiteConfig of matchingSuiteConfigs) {
      try {
        await this.executeEvaluationsForSuiteConfig({
          tenantId,
          projectId,
          conversationId,
          conversation,
          suiteConfigId: matchingSuiteConfig.suiteConfigId,
          evaluationRunId: evaluationRun.id,
        });
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            suiteConfigId: matchingSuiteConfig.suiteConfigId,
            evaluationRunId: evaluationRun.id,
          },
          'Error executing evaluations for suite config'
        );
        // Continue with other suite configs
      }
    }
  }

  /**
   * Check if suite config filters match the conversation
   */
  private async checkSuiteConfigMatch(
    conversation: typeof import('@inkeep/agents-core').conversations.$inferSelect,
    filters: Filter<EvaluationSuiteFilterCriteria> | null,
    tenantId: string,
    projectId: string
  ): Promise<boolean> {
    if (!filters) {
      // No filters means match all
      return true;
    }

    return this.evaluateFilter(conversation, filters, tenantId, projectId);
  }

  /**
   * Recursively evaluate filter conditions
   */
  private async evaluateFilter(
    conversation: typeof import('@inkeep/agents-core').conversations.$inferSelect,
    filter: Filter<EvaluationSuiteFilterCriteria>,
    tenantId: string,
    projectId: string
  ): Promise<boolean> {
    // Handle 'and' conditions
    if ('and' in filter && Array.isArray(filter.and)) {
      const results = await Promise.all(
        filter.and.map((subFilter) =>
          this.evaluateFilter(conversation, subFilter, tenantId, projectId)
        )
      );
      return results.every((result) => result === true);
    }

    // Handle 'or' conditions
    if ('or' in filter && Array.isArray(filter.or)) {
      const results = await Promise.all(
        filter.or.map((subFilter) =>
          this.evaluateFilter(conversation, subFilter, tenantId, projectId)
        )
      );
      return results.some((result) => result === true);
    }

    // Handle direct filter criteria
    const criteria = filter as EvaluationSuiteFilterCriteria;

    // Check agentIds filter
    if (criteria.agentIds && Array.isArray(criteria.agentIds) && criteria.agentIds.length > 0) {
      // Get agentId from conversation's activeSubAgentId
      if (conversation.activeSubAgentId) {
        try {
          const subAgent = await dbClient.query.subAgents.findFirst({
            where: (subAgents, { eq, and }) =>
              and(
                eq(subAgents.tenantId, tenantId),
                eq(subAgents.projectId, projectId),
                eq(subAgents.id, conversation.activeSubAgentId)
              ),
          });

          if (subAgent && criteria.agentIds.includes(subAgent.agentId)) {
            return true;
          }
        } catch (error) {
          logger.warn(
            { error, activeSubAgentId: conversation.activeSubAgentId },
            'Failed to fetch subagent for filter check'
          );
        }
      }
      // If agentIds filter is specified but doesn't match, return false
      return false;
    }

    // If no specific filters are specified, default to true (match all)
    return true;
  }

  /**
   * Execute evaluations for a suite config
   */
  private async executeEvaluationsForSuiteConfig(params: {
    tenantId: string;
    projectId: string;
    conversationId: string;
    conversation: typeof import('@inkeep/agents-core').conversations.$inferSelect;
    suiteConfigId: string;
    evaluationRunId: string;
  }): Promise<void> {
    const { tenantId, projectId, conversationId, conversation, suiteConfigId, evaluationRunId } =
      params;

    // Get evaluators for this suite config
    const evaluatorRelations = await getEvaluationSuiteConfigEvaluatorRelations(dbClient)({
      scopes: { tenantId, projectId, evaluationSuiteConfigId: suiteConfigId },
    });

    if (evaluatorRelations.length === 0) {
      logger.warn({ suiteConfigId }, 'No evaluators found for suite config');
      return;
    }

    // Get evaluator details
    const evaluators = await Promise.all(
      evaluatorRelations.map((relation) =>
        getEvaluatorById(dbClient)({
          scopes: { tenantId, projectId, evaluatorId: relation.evaluatorId },
        })
      )
    );

    const validEvaluators = evaluators.filter((e): e is NonNullable<typeof e> => e !== null);

    if (validEvaluators.length === 0) {
      logger.warn({ suiteConfigId }, 'No valid evaluators found for suite config');
      return;
    }

    logger.info(
      { suiteConfigId, evaluatorCount: validEvaluators.length },
      'Executing evaluations for suite config'
    );

    // Execute each evaluator
    for (const evaluator of validEvaluators) {
      try {
        await this.executeEvaluation({
          tenantId,
          projectId,
          conversationId,
          conversation,
          evaluator,
          evaluationRunId,
        });
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            evaluatorId: evaluator.id,
            conversationId,
            evaluationRunId,
          },
          'Error executing evaluation'
        );
        // Continue with other evaluators
      }
    }
  }

  /**
   * Execute a single evaluation
   */
  private async executeEvaluation(params: {
    tenantId: string;
    projectId: string;
    conversationId: string;
    conversation: typeof import('@inkeep/agents-core').conversations.$inferSelect;
    evaluator: typeof import('@inkeep/agents-core').evaluator.$inferSelect;
    evaluationRunId: string;
  }): Promise<void> {
    const { tenantId, projectId, conversationId, conversation, evaluator, evaluationRunId } =
      params;

    logger.warn(
      {
        conversationId,
        evaluatorId: evaluator.id,
        evaluationRunId,
        conversationActiveSubAgentId: conversation.activeSubAgentId,
        conversationCreatedAt: conversation.createdAt,
      },
      '=== EXECUTING EVALUATION ==='
    );

    // Check for existing evaluation results with the same conversationId and evaluatorId
    const existingResults = await listEvaluationResultsByConversation(dbClient)({
      scopes: { tenantId, projectId, conversationId },
    });

    // Filter to only results with the same evaluatorId
    const matchingResults = existingResults.filter((result) => result.evaluatorId === evaluator.id);

    // Delete existing evaluation results for this conversation and evaluator
    if (matchingResults.length > 0) {
      logger.info(
        {
          conversationId,
          evaluatorId: evaluator.id,
          existingResultCount: matchingResults.length,
        },
        'Deleting existing evaluation results before creating new one'
      );

      await Promise.all(
        matchingResults.map((result) =>
          deleteEvaluationResult(dbClient)({
            scopes: { tenantId, projectId, evaluationResultId: result.id },
          })
        )
      );
    }

    // Create evaluation result record
    const evalResult = await createEvaluationResult(dbClient)({
      id: generateId(),
      tenantId,
      projectId,
      conversationId,
      evaluatorId: evaluator.id,
      evaluationRunId,
    });

    try {
      // Get conversation history
      const conversationHistory = await getConversationHistory(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
        options: {
          includeInternal: false,
          limit: 100,
        },
      });

      // Get agent definition
      let agentDefinition: FullAgentDefinition | null = null;
      let agentId: string | null = null;

      try {
        const activeSubAgentId = conversation.activeSubAgentId;
        if (activeSubAgentId) {
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
          { error, conversationId, activeSubAgentId: conversation.activeSubAgentId },
          'Failed to fetch agent definition for evaluation'
        );
      }

      // Wait 30 seconds before fetching trace to allow it to be available
      logger.warn(
        {
          conversationId,
          evaluatorId: evaluator.id,
          evaluationRunId,
        },
        '=== WAITING 30 SECONDS BEFORE FETCHING TRACE ==='
      );
      await new Promise((resolve) => setTimeout(resolve, 30000));

      // Fetch trace from SigNoz
      logger.warn(
        {
          conversationId,
          evaluatorId: evaluator.id,
          evaluationRunId,
        },
        '=== FETCHING TRACE FROM SIGNOZ FOR CONVERSATION ==='
      );
      const prettifiedTrace = await this.fetchTraceFromSigNoz(conversationId);

      logger.info(
        {
          conversationId,
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

      // Parse schema
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

      const evaluationPrompt = this.buildEvaluationPrompt(
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

      // Update evaluation result with output
      await updateEvaluationResult(dbClient)({
        scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
        data: {
          output: llmResponse.result as any,
        },
      });

      logger.info(
        { conversationId, evaluatorId: evaluator.id, resultId: evalResult.id },
        'Evaluation completed successfully'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          conversationId,
          evaluatorId: evaluator.id,
          resultId: evalResult.id,
        },
        'Evaluation execution failed'
      );

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateEvaluationResult(dbClient)({
        scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
        data: {
          output: { text: `Evaluation failed: ${errorMessage}` } as any,
        },
      });
    }
  }

  /**
   * Build evaluation prompt
   */
  private buildEvaluationPrompt(
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
   * Fetch trace from SigNoz
   */
  private async fetchTraceFromSigNoz(conversationId: string): Promise<any | null> {
    const manageUIUrl = env.AGENTS_MANAGE_UI_URL;

    try {
      logger.info({ conversationId, manageUIUrl }, 'Fetching trace from SigNoz');

      const traceResponse = await fetch(
        `${manageUIUrl}/api/signoz/conversations/${conversationId}`
      );

      if (!traceResponse.ok) {
        logger.warn(
          { conversationId, status: traceResponse.status, statusText: traceResponse.statusText },
          'Failed to fetch trace from SigNoz'
        );
        return null;
      }

      const conversationDetail = (await traceResponse.json()) as any;

      logger.info(
        { conversationId, activityCount: conversationDetail.activities?.length || 0 },
        'Trace fetched successfully'
      );

      const prettifiedTrace = this.formatConversationAsPrettifiedTrace(conversationDetail);

      return prettifiedTrace;
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

  /**
   * Call LLM API using AI SDK
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
    } catch (error) {
      logger.error({ error, schema }, 'Failed to convert JSON schema to Zod, using fallback');
      resultSchema = z.record(z.string(), z.unknown());
    }

    try {
      const result = await generateObject({
        ...languageModel,
        schema: resultSchema,
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
      // Fallback to generateText with JSON parsing
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        {
          error: errorMessage,
          schema: JSON.stringify(schema, null, 2),
          promptPreview: prompt.substring(0, 500),
        },
        'generateObject failed, falling back to generateText with JSON parsing'
      );

      try {
        const schemaDescription = JSON.stringify(schema, null, 2);
        const enhancedPrompt = `${prompt}

IMPORTANT: You must respond with valid JSON matching this exact schema:
${schemaDescription}

Return ONLY valid JSON, no markdown formatting, no code blocks.`;

        const textResult = await generateText({
          ...languageModel,
          prompt: enhancedPrompt,
          temperature: (providerOptions.temperature as number) ?? 0.3,
        });

        let jsonText = textResult.text.trim();
        const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }

        const parsed = JSON.parse(jsonText);

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
}

// Export singleton instance
export const conversationEvaluationTrigger = new ConversationEvaluationTrigger();

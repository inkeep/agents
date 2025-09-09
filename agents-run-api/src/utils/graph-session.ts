import type {
  Artifact,
  ModelSettings,
  StatusComponent,
  StatusUpdateSettings,
} from '@inkeep/agents-core';
import { SpanStatusCode } from '@opentelemetry/api';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { ModelFactory } from '../agents/ModelFactory';
import { getFormattedConversationHistory } from '../data/conversations';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { createSpanName, getGlobalTracer, handleSpanError } from '../tracer';
import { statusUpdateOp } from './agent-operations';
import { getStreamHelper } from './stream-registry';

const logger = getLogger('GraphSession');
const tracer = getGlobalTracer();

export type GraphSessionEventType =
  | 'agent_generate'
  | 'transfer'
  | 'delegation_sent'
  | 'delegation_returned'
  | 'artifact_saved'
  | 'tool_execution';

export interface GraphSessionEvent {
  timestamp: number;
  eventType: GraphSessionEventType;
  agentId: string;
  data: EventData;
}

export type EventData =
  | AgentGenerateData
  | TransferData
  | DelegationSentData
  | DelegationReturnedData
  | ArtifactSavedData
  | ToolExecutionData;

export interface AgentGenerateData {
  parts: Array<{
    type: 'text' | 'tool_call' | 'tool_result';
    content?: string;
    toolName?: string;
    args?: any;
    result?: any;
  }>;
  generationType: 'text_generation' | 'object_generation' | 'artifact_name_description';
}

export interface TransferData {
  fromAgent: string;
  targetAgent: string;
  reason?: string;
  context?: any;
}

export interface DelegationSentData {
  delegationId: string;
  fromAgent: string;
  targetAgent: string;
  taskDescription: string;
  context?: any;
}

export interface DelegationReturnedData {
  delegationId: string;
  fromAgent: string;
  targetAgent: string;
  result?: any;
}

export interface ArtifactSavedData {
  artifactId: string;
  taskId: string;
  artifactType: string;
  summaryData?: Record<string, any>;
  fullData?: Record<string, any>;
  pendingGeneration?: boolean;
  tenantId?: string;
  projectId?: string;
  contextId?: string;
  metadata?: Record<string, any>;
  summaryProps?: Record<string, any>;
  fullProps?: Record<string, any>;
}

export interface ToolExecutionData {
  toolName: string;
  args: any;
  result: any;
  toolId?: string;
  duration?: number;
}

interface StatusUpdateState {
  lastUpdateTime: number;
  lastEventCount: number;
  startTime: number;
  config: StatusUpdateSettings;
  summarizerModel?: ModelSettings;
}

/**
 * Tracks all agent operations and interactions for a single message
 * Now includes intelligent status update functionality
 */
export class GraphSession {
  private events: GraphSessionEvent[] = [];
  private statusUpdateState?: StatusUpdateState;
  private statusUpdateTimer?: ReturnType<typeof setInterval>;
  private previousSummaries: string[] = [];
  private isEnded: boolean = false;
  private isTextStreaming: boolean = false;
  private isGeneratingUpdate: boolean = false;

  constructor(
    public readonly sessionId: string,
    public readonly messageId: string,
    public readonly graphId?: string,
    public readonly tenantId?: string,
    public readonly projectId?: string
  ) {
    logger.debug({ sessionId, messageId, graphId }, 'GraphSession created');
  }

  /**
   * Initialize status updates for this session
   */
  initializeStatusUpdates(config: StatusUpdateSettings, summarizerModel?: ModelSettings): void {
    const now = Date.now();
    this.statusUpdateState = {
      lastUpdateTime: now,
      lastEventCount: 0,
      startTime: now,
      summarizerModel,
      config: {
        numEvents: config.numEvents || 10,
        timeInSeconds: config.timeInSeconds || 30,
        ...config,
      },
    };

    // Set up time-based updates if configured
    if (this.statusUpdateState.config.timeInSeconds) {
      this.statusUpdateTimer = setInterval(async () => {
        // Guard against cleanup race condition
        if (!this.statusUpdateState || this.isEnded) {
          logger.debug(
            { sessionId: this.sessionId },
            'Timer triggered but session already cleaned up or ended'
          );
          if (this.statusUpdateTimer) {
            clearInterval(this.statusUpdateTimer);
            this.statusUpdateTimer = undefined;
          }
          return;
        }
        await this.checkAndSendTimeBasedUpdate();
      }, this.statusUpdateState.config.timeInSeconds * 1000);

      logger.info(
        {
          sessionId: this.sessionId,
          intervalMs: this.statusUpdateState.config.timeInSeconds * 1000,
        },
        'Time-based status update timer started'
      );
    }
  }

  /**
   * Record an event in the session and trigger status updates if configured
   */
  recordEvent(eventType: GraphSessionEventType, agentId: string, data: EventData): void {
    // Don't record events or trigger updates if session has ended
    if (this.isEnded) {
      logger.debug(
        {
          sessionId: this.sessionId,
          eventType,
          agentId,
        },
        'Event received after session ended - ignoring'
      );
      return;
    }

    const event: GraphSessionEvent = {
      timestamp: Date.now(),
      eventType,
      agentId,
      data,
    };

    this.events.push(event);

    // Process artifact if it's pending generation
    if (eventType === 'artifact_saved' && (data as ArtifactSavedData).pendingGeneration) {
      // Fire and forget - process artifact completely asynchronously without any blocking
      setImmediate(() => {
        // No await, no spans at trigger level - truly fire and forget
        this.processArtifact(data as ArtifactSavedData).catch((error) => {
          logger.error(
            {
              sessionId: this.sessionId,
              artifactId: (data as ArtifactSavedData).artifactId,
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              artifactData: data,
            },
            'Failed to process artifact - fire and forget error'
          );
        });
      });
    }

    // Trigger status updates check (only sends if thresholds met)
    if (!this.isEnded) {
      this.checkStatusUpdates();
    }
  }

  /**
   * Check and send status updates if configured (async, non-blocking)
   */
  private checkStatusUpdates(): void {
    if (this.isEnded) {
      logger.debug(
        { sessionId: this.sessionId },
        'Session has ended - skipping status update check'
      );
      return;
    }

    if (!this.statusUpdateState) {
      logger.debug({ sessionId: this.sessionId }, 'No status update state - skipping check');
      return;
    }

    // Status updates are enabled by having statusUpdateState

    // Store reference to prevent race condition during async execution
    const statusUpdateState = this.statusUpdateState;

    // Run async without blocking the main flow
    setImmediate(async () => {
      try {
        // Check if session is still active and statusUpdateState hasn't been cleaned up or text is streaming
        if (this.isEnded || !statusUpdateState || this.isTextStreaming) {
          return;
        }

        const currentEventCount = this.events.length;
        const numEventsThreshold = statusUpdateState.config.numEvents;

        const shouldUpdateByEvents =
          numEventsThreshold &&
          currentEventCount >= statusUpdateState.lastEventCount + numEventsThreshold;

        if (shouldUpdateByEvents) {
          await this.generateAndSendUpdate();
        }
      } catch (error) {
        logger.error(
          {
            sessionId: this.sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to check status updates during event recording'
        );
      }
    });
  }

  /**
   * Check and send time-based status updates
   */
  private async checkAndSendTimeBasedUpdate(): Promise<void> {
    if (this.isEnded) {
      logger.debug({ sessionId: this.sessionId }, 'Session has ended - skipping time-based update');
      return;
    }

    if (!this.statusUpdateState) {
      logger.debug(
        { sessionId: this.sessionId },
        'No status updates configured for time-based check'
      );
      return;
    }

    // Only send if we have new events since last update
    const newEventCount = this.events.length - this.statusUpdateState.lastEventCount;
    if (newEventCount === 0) {
      return;
    }

    try {
      // Always send time-based updates regardless of event count
      await this.generateAndSendUpdate();
    } catch (error) {
      logger.error(
        {
          sessionId: this.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to send time-based status update'
      );
    }
  }

  /**
   * Get all events in chronological order
   */
  getEvents(): GraphSessionEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by type
   */
  getEventsByType(eventType: GraphSessionEventType): GraphSessionEvent[] {
    return this.events.filter((event) => event.eventType === eventType);
  }

  /**
   * Get events filtered by agent
   */
  getEventsByAgent(agentId: string): GraphSessionEvent[] {
    return this.events.filter((event) => event.agentId === agentId);
  }

  /**
   * Get summary of session activity
   */
  getSummary() {
    const eventCounts = this.events.reduce(
      (counts, event) => {
        counts[event.eventType] = (counts[event.eventType] || 0) + 1;
        return counts;
      },
      {} as Record<GraphSessionEventType, number>
    );

    const agentCounts = this.events.reduce(
      (counts, event) => {
        counts[event.agentId] = (counts[event.agentId] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    return {
      sessionId: this.sessionId,
      messageId: this.messageId,
      graphId: this.graphId,
      totalEvents: this.events.length,
      eventCounts,
      agentCounts,
      startTime: this.events[0]?.timestamp,
      endTime: this.events[this.events.length - 1]?.timestamp,
      duration:
        this.events.length > 0
          ? this.events[this.events.length - 1].timestamp - this.events[0].timestamp
          : 0,
    };
  }

  /**
   * Mark that text streaming has started (to suppress status updates)
   */
  setTextStreaming(isStreaming: boolean): void {
    this.isTextStreaming = isStreaming;
  }

  /**
   * Check if text is currently being streamed
   */
  isCurrentlyStreaming(): boolean {
    return this.isTextStreaming;
  }

  /**
   * Clean up status update resources when session ends
   */
  cleanup(): void {
    // Mark session as ended
    this.isEnded = true;

    if (this.statusUpdateTimer) {
      clearInterval(this.statusUpdateTimer);
      this.statusUpdateTimer = undefined;
    }
    this.statusUpdateState = undefined;
  }

  /**
   * Generate and send a status update using graph-level summarizer
   */
  private async generateAndSendUpdate(): Promise<void> {
    if (this.isEnded) {
      logger.debug({ sessionId: this.sessionId }, 'Session has ended - not generating update');
      return;
    }

    if (this.isTextStreaming) {
      logger.debug(
        { sessionId: this.sessionId },
        'Text is currently streaming - skipping status update'
      );
      return;
    }

    if (this.isGeneratingUpdate) {
      logger.debug(
        { sessionId: this.sessionId },
        'Update already in progress - skipping duplicate generation'
      );
      return;
    }

    if (!this.statusUpdateState) {
      logger.warn({ sessionId: this.sessionId }, 'No status update state - cannot generate update');
      return;
    }

    if (!this.graphId) {
      logger.warn({ sessionId: this.sessionId }, 'No graph ID - cannot generate update');
      return;
    }

    // Only send if we have new events since last update
    const newEventCount = this.events.length - this.statusUpdateState.lastEventCount;
    if (newEventCount === 0) {
      return;
    }

    // Set flag to prevent concurrent updates
    this.isGeneratingUpdate = true;

    // Store references at start to prevent race conditions
    const statusUpdateState = this.statusUpdateState;
    const graphId = this.graphId;

    try {
      const streamHelper = getStreamHelper(this.sessionId);
      if (!streamHelper) {
        logger.warn(
          { sessionId: this.sessionId },
          'No stream helper found - cannot send status update'
        );
        this.isGeneratingUpdate = false;
        return;
      }

      const now = Date.now();
      const elapsedTime = now - statusUpdateState.startTime;

      // Generate status update - either structured or text summary
      let operation: any;

      if (
        statusUpdateState.config.statusComponents &&
        statusUpdateState.config.statusComponents.length > 0
      ) {
        // Use generateObject to intelligently select relevant data components
        const result = await this.generateStructuredStatusUpdate(
          this.events.slice(statusUpdateState.lastEventCount),
          elapsedTime,
          statusUpdateState.config.statusComponents,
          statusUpdateState.summarizerModel,
          this.previousSummaries
        );

        if (result.operations && result.operations.length > 0) {
          // Send each operation separately using writeData for dynamic types
          for (const op of result.operations) {
            // Guard against empty/invalid operations
            if (!op || !op.type || !op.data || Object.keys(op.data).length === 0) {
              logger.warn(
                {
                  sessionId: this.sessionId,
                  operation: op,
                },
                'Skipping empty or invalid structured operation'
              );
              continue;
            }

            const operationToSend = {
              type: 'status_update' as const,
              ctx: {
                operationType: op.type,
                data: op.data,
              },
            };

            await streamHelper.writeOperation(operationToSend);
          }

          // Store summaries for next time - use full JSON for better comparison
          const summaryTexts = result.operations.map((op) =>
            JSON.stringify({ type: op.type, data: op.data })
          );
          this.previousSummaries.push(...summaryTexts);

          // Update state after sending all operations
          if (this.statusUpdateState) {
            this.statusUpdateState.lastUpdateTime = now;
            this.statusUpdateState.lastEventCount = this.events.length;
          }

          return;
        } else {
          // Fall through to regular text summary if no structured updates
        }
      } else {
        // Use regular text generation for simple summaries
        const summary = await this.generateProgressSummary(
          this.events.slice(statusUpdateState.lastEventCount),
          elapsedTime,
          statusUpdateState.summarizerModel,
          this.previousSummaries
        );

        // Store this summary for next time
        this.previousSummaries.push(summary);

        // Create standard status update operation
        operation = statusUpdateOp({
          summary,
          eventCount: this.events.length,
          elapsedTime,
          currentPhase: 'processing',
          activeAgent: 'system',
          graphId,
          sessionId: this.sessionId,
        });
      }

      // Keep only last 3 summaries to avoid context getting too large
      if (this.previousSummaries.length > 3) {
        this.previousSummaries.shift();
      }

      // Guard against sending empty/undefined operations that break streams
      if (!operation || !operation.type || !operation.ctx) {
        logger.warn(
          {
            sessionId: this.sessionId,
            operation,
          },
          'Skipping empty or invalid status update operation'
        );
        return;
      }

      await streamHelper.writeOperation(operation);

      // Update state - check if still exists (could be cleaned up during async operation)
      if (this.statusUpdateState) {
        this.statusUpdateState.lastUpdateTime = now;
        this.statusUpdateState.lastEventCount = this.events.length;
      }
    } catch (error) {
      logger.error(
        {
          sessionId: this.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        '❌ Failed to generate status update'
      );
    } finally {
      // Clear the flag to allow future updates
      this.isGeneratingUpdate = false;
    }
  }

  /**
   * Generate user-focused progress summary hiding internal operations
   */
  private async generateProgressSummary(
    newEvents: GraphSessionEvent[],
    elapsedTime: number,
    summarizerModel?: ModelSettings,
    previousSummaries: string[] = []
  ): Promise<string> {
    return tracer.startActiveSpan(
      createSpanName('graph_session.generate_progress_summary'),
      {
        attributes: {
          'graph_session.id': this.sessionId,
          'events.count': newEvents.length,
          'elapsed_time.seconds': Math.round(elapsedTime / 1000),
          'llm.model': summarizerModel?.model || 'openai/gpt-4.1-nano-2025-04-14',
          'previous_summaries.count': previousSummaries.length,
        },
      },
      async (span) => {
        try {
          // Extract user-visible activities (hide internal agent operations)
          const userVisibleActivities = this.extractUserVisibleActivities(newEvents);

          // Get conversation history to understand user's context and question
          let conversationContext = '';
          if (this.tenantId && this.projectId) {
            try {
              const conversationHistory = await getFormattedConversationHistory({
                tenantId: this.tenantId,
                projectId: this.projectId,
                conversationId: this.sessionId,
                options: {
                  limit: 10, // Get recent conversation context
                  maxOutputTokens: 2000,
                },
                filters: {},
              });
              conversationContext = conversationHistory.trim()
                ? `\nUser's Question/Context:\n${conversationHistory}\n`
                : '';
            } catch (error) {
              logger.warn(
                { sessionId: this.sessionId, error },
                'Failed to fetch conversation history for status update'
              );
            }
          }

          const previousSummaryContext =
            previousSummaries.length > 0
              ? `\nPrevious updates provided to user:\n${previousSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
              : '';

          // Use custom prompt if provided, otherwise use default
          const basePrompt = `Generate a brief status update for what is happening now to the user. Please keep it short and concise and informative based on what the user has asked for.${conversationContext}${previousSummaries.length > 0 ? `\n${previousSummaryContext}` : ''}

Activities:\n${userVisibleActivities.join('\n') || 'No New Activities'}

What's happening now?

${this.statusUpdateState?.config.prompt?.trim() || ''}`;

          const prompt = basePrompt;

          const model = ModelFactory.createModel(
            summarizerModel && summarizerModel.model?.trim()
              ? summarizerModel
              : { model: 'openai/gpt-4.1-nano-2025-04-14' }
          );

          const { text } = await generateText({
            model,
            prompt,
            experimental_telemetry: {
              isEnabled: true,
              functionId: `status_update_${this.sessionId}`,
              recordInputs: true,
              recordOutputs: true,
              metadata: {
                operation: 'progress_summary_generation',
                sessionId: this.sessionId,
              },
            },
          });

          span.setAttributes({
            'summary.length': text.trim().length,
            'user_activities.count': userVisibleActivities.length,
          });
          span.setStatus({ code: SpanStatusCode.OK });

          return text.trim();
        } catch (error) {
          handleSpanError(span, error);
          logger.error({ error }, 'Failed to generate summary, using fallback');
          return this.generateFallbackSummary(newEvents, elapsedTime);
        } finally {
          span.end();
        }
      }
    );
  }

  /**
   * Generate structured status update using configured data components
   */
  private async generateStructuredStatusUpdate(
    newEvents: GraphSessionEvent[],
    elapsedTime: number,
    statusComponents: StatusComponent[],
    summarizerModel?: ModelSettings,
    previousSummaries: string[] = []
  ): Promise<{ operations: Array<{ type: string; data: Record<string, any> }> }> {
    return tracer.startActiveSpan(
      createSpanName('graph_session.generate_structured_update'),
      {
        attributes: {
          'graph_session.id': this.sessionId,
          'events.count': newEvents.length,
          'elapsed_time.seconds': Math.round(elapsedTime / 1000),
          'llm.model': summarizerModel?.model || 'openai/gpt-4.1-nano-2025-04-14',
          'status_components.count': statusComponents.length,
          'previous_summaries.count': previousSummaries.length,
        },
      },
      async (span) => {
        try {
          // Extract user-visible activities
          const userVisibleActivities = this.extractUserVisibleActivities(newEvents);

          // Get conversation history to understand user's context and question
          let conversationContext = '';
          if (this.tenantId && this.projectId) {
            try {
              const conversationHistory = await getFormattedConversationHistory({
                tenantId: this.tenantId,
                projectId: this.projectId,
                conversationId: this.sessionId,
                options: {
                  limit: 10, // Get recent conversation context
                  maxOutputTokens: 2000,
                },
                filters: {},
              });
              conversationContext = conversationHistory.trim()
                ? `\nUser's Question/Context:\n${conversationHistory}\n`
                : '';
            } catch (error) {
              logger.warn(
                { sessionId: this.sessionId, error },
                'Failed to fetch conversation history for structured status update'
              );
            }
          }

          const previousSummaryContext =
            previousSummaries.length > 0
              ? `\nPrevious updates sent to user:\n${previousSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
              : '';

          // Build schema for data components and no_relevant_updates option
          const selectionSchema = z.object(
            Object.fromEntries([
              // Add no_relevant_updates schema
              [
                'no_relevant_updates',
                z
                  .object({
                    no_updates: z.boolean().default(true),
                  })
                  .optional()
                  .describe(
                    'Use when nothing substantially new to report. Should only use on its own.'
                  ),
              ],
              // Add all other component schemas
              ...statusComponents.map((component) => [
                component.id,
                this.buildZodSchema(component.schema)
                  .optional()
                  .describe(component.description || component.name),
              ]),
            ])
          );

          // Use custom prompt if provided, otherwise use default
          const basePrompt = `Generate status updates for relevant components based on what the user has asked for.${conversationContext}${previousSummaries.length > 0 ? `\n${previousSummaryContext}` : ''}

Activities:\n${userVisibleActivities.join('\n') || 'No New Activities'}

Available components: no_relevant_updates, ${statusComponents.map((c) => c.id).join(', ')}

Rules:
- Fill in data for relevant components only
- Use 'no_relevant_updates' if nothing substantially new to report
- Never repeat previous values
- You are ONE AI (no agents/delegations)

${this.statusUpdateState?.config.prompt?.trim() || ''}`;

          const prompt = basePrompt;

          const model = ModelFactory.createModel(
            summarizerModel && summarizerModel.model?.trim()
              ? summarizerModel
              : { model: 'openai/gpt-4.1-nano-2025-04-14' }
          );

          const { object } = await generateObject({
            model,
            prompt,
            schema: selectionSchema,
            experimental_telemetry: {
              isEnabled: true,
              functionId: `structured_update_${this.sessionId}`,
              recordInputs: true,
              recordOutputs: true,
              metadata: {
                operation: 'structured_status_update_generation',
                sessionId: this.sessionId,
              },
            },
          });

          const result = object as any;

          // Extract components that have data (skip no_relevant_updates and empty components)
          const operations = [];
          for (const [componentId, data] of Object.entries(result)) {
            // Skip no_relevant_updates - we don't send any operation for this
            if (componentId === 'no_relevant_updates') {
              continue;
            }

            // Only include components that have actual data
            if (data && typeof data === 'object' && Object.keys(data).length > 0) {
              operations.push({
                type: componentId,
                data: data,
              });
            }
          }

          span.setAttributes({
            'operations.count': operations.length,
            'user_activities.count': userVisibleActivities.length,
            'result_keys.count': Object.keys(result).length,
          });
          span.setStatus({ code: SpanStatusCode.OK });

          return { operations };
        } catch (error) {
          handleSpanError(span, error);
          logger.error({ error }, 'Failed to generate structured update, using fallback');
          return { operations: [] };
        } finally {
          span.end();
        }
      }
    );
  }

  /**
   * Build Zod schema from JSON schema configuration
   */
  private buildZodSchema(jsonSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  }): z.ZodType<any> {
    const properties: Record<string, z.ZodType<any>> = {};

    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      // Simple type mapping - can be expanded as needed
      if (value.type === 'string') {
        properties[key] = z.string();
      } else if (value.type === 'number') {
        properties[key] = z.number();
      } else if (value.type === 'boolean') {
        properties[key] = z.boolean();
      } else if (value.type === 'array') {
        properties[key] = z.array(z.any());
      } else if (value.type === 'object') {
        properties[key] = z.record(z.string(), z.any());
      } else {
        properties[key] = z.any();
      }

      // Make optional if not in required array
      if (!jsonSchema.required?.includes(key)) {
        properties[key] = properties[key].optional();
      }
    }

    return z.object(properties);
  }

  /**
   * Extract user-visible activities with rich formatting and complete information
   */
  private extractUserVisibleActivities(events: GraphSessionEvent[]): string[] {
    const activities: string[] = [];

    for (const event of events) {
      switch (event.eventType) {
        case 'tool_execution': {
          const data = event.data as ToolExecutionData;
          const resultStr = JSON.stringify(data.result);

          activities.push(
            `🔧 **${data.toolName}** ${data.duration ? `(${data.duration}ms)` : ''}\n` +
              `   📥 Input: ${JSON.stringify(data.args)}\n` +
              `   📤 Output: ${resultStr}`
          );
          break;
        }

        case 'transfer': {
          const data = event.data as TransferData;
          activities.push(
            `🔄 **Transfer**: ${data.fromAgent} → ${data.targetAgent}\n` +
              `   ${data.reason ? `Reason: ${data.reason}` : 'Control transfer'}\n` +
              `   ${data.context ? `Context: ${JSON.stringify(data.context, null, 2)}` : ''}`
          );
          break;
        }

        case 'delegation_sent': {
          const data = event.data as DelegationSentData;
          activities.push(
            `📤 **Delegation Sent** [${data.delegationId}]: ${data.fromAgent} → ${data.targetAgent}\n` +
              `   Task: ${data.taskDescription}\n` +
              `   ${data.context ? `Context: ${JSON.stringify(data.context, null, 2)}` : ''}`
          );
          break;
        }

        case 'delegation_returned': {
          const data = event.data as DelegationReturnedData;
          activities.push(
            `📥 **Delegation Returned** [${data.delegationId}]: ${data.fromAgent} ← ${data.targetAgent}\n` +
              `   Result: ${JSON.stringify(data.result, null, 2)}`
          );
          break;
        }

        case 'artifact_saved': {
          const data = event.data as ArtifactSavedData;
          activities.push(
            `💾 **Artifact Saved**: ${data.artifactType}\n` +
              `   ID: ${data.artifactId}\n` +
              `   Task: ${data.taskId}\n` +
              `   ${data.summaryData ? `Summary: ${data.summaryData}` : ''}\n` +
              `   ${data.fullData ? `Full Data: ${data.fullData}` : ''}`
          );
          break;
        }

        case 'agent_generate': {
          const data = event.data as AgentGenerateData;
          if (data.generationType !== 'artifact_name_description') {
            activities.push(
              `⚙️ **Generation**: ${data.generationType}\n` +
                `   Full Details: ${JSON.stringify(data.parts, null, 2)}`
            );
          }
          break;
        }

        default: {
          activities.push(`📋 **${event.eventType}**: ${JSON.stringify(event.data, null, 2)}`);
          break;
        }
      }
    }

    return activities;
  }

  /**
   * Generate fallback summary when LLM fails
   */
  private generateFallbackSummary(events: GraphSessionEvent[], elapsedTime: number): string {
    const timeStr = Math.round(elapsedTime / 1000);
    const toolCalls = events.filter((e) => e.eventType === 'tool_execution').length;
    const artifacts = events.filter((e) => e.eventType === 'artifact_saved').length;

    if (artifacts > 0) {
      return `Generated ${artifacts} result${artifacts > 1 ? 's' : ''} so far (${timeStr}s elapsed)`;
    } else if (toolCalls > 0) {
      return `Used ${toolCalls} tool${toolCalls > 1 ? 's' : ''} to gather information (${timeStr}s elapsed)`;
    } else {
      return `Processing your request... (${timeStr}s elapsed)`;
    }
  }

  /**
   * Process a single artifact to generate name and description using conversation context
   */
  private async processArtifact(artifactData: ArtifactSavedData): Promise<void> {
    return tracer.startActiveSpan(
      createSpanName('graph_session.process_artifact'),
      {
        attributes: {
          'graph_session.id': this.sessionId,
          'artifact.id': artifactData.artifactId,
          'artifact.type': artifactData.artifactType || 'unknown',
          'tenant.id': artifactData.tenantId || 'unknown',
          'project.id': artifactData.projectId || 'unknown',
          'context.id': artifactData.contextId || 'unknown',
          has_tenant_id: !!artifactData.tenantId,
          has_project_id: !!artifactData.projectId,
          has_context_id: !!artifactData.contextId,
          has_metadata: !!artifactData.metadata,
          tool_call_id: artifactData.metadata?.toolCallId || 'missing',
          pending_generation: !!artifactData.pendingGeneration,
        },
      },
      async (span) => {
        try {
          // We need tenantId, projectId, and contextId to get conversation history
          if (!artifactData.tenantId || !artifactData.projectId || !artifactData.contextId) {
            span.setAttributes({
              'validation.failed': true,
              missing_tenant_id: !artifactData.tenantId,
              missing_project_id: !artifactData.projectId,
              missing_context_id: !artifactData.contextId,
            });
            throw new Error(
              'Missing required session info (tenantId, projectId, or contextId) for artifact processing'
            );
          }

          span.setAttributes({ 'validation.passed': true });

          // Get conversation history for context
          span.setAttributes({ step: 'importing_conversations' });
          const { getFormattedConversationHistory } = await import('../data/conversations.js');
          span.setAttributes({ step: 'fetching_conversation_history' });
          const conversationHistory = await getFormattedConversationHistory({
            tenantId: artifactData.tenantId,
            projectId: artifactData.projectId,
            conversationId: artifactData.contextId,
            options: {
              limit: 10, // Only need recent context
              includeInternal: false, // Focus on user messages
              messageTypes: ['chat'],
            },
          });
          span.setAttributes({
            step: 'conversation_history_fetched',
            'conversation_history.length': conversationHistory.length,
          });

          // Find the specific tool call that generated this artifact
          // Now toolId and toolCallId should be the same since we use AI SDK's toolCallId consistently
          const toolCallEvent = this.events.find(
            (event) =>
              event.eventType === 'tool_execution' &&
              event.data &&
              'toolId' in event.data &&
              event.data.toolId === artifactData.metadata?.toolCallId
          ) as GraphSessionEvent | undefined;

          const toolResultEvent = this.events.find(
            (event) =>
              event.eventType === 'tool_execution' &&
              event.data &&
              'toolId' in event.data &&
              event.data.toolId === artifactData.metadata?.toolCallId
          ) as GraphSessionEvent | undefined;

          // Prepare context for name/description generation
          const toolContext = toolCallEvent
            ? {
                toolName: (toolCallEvent.data as any).toolName,
                args: (toolCallEvent.data as any).args,
              }
            : null;

          const toolResult = toolResultEvent
            ? {
                result: (toolResultEvent.data as any).result,
              }
            : null;

          const prompt = `Name this artifact (max 50 chars) and describe it (max 150 chars).

Context: ${conversationHistory?.slice(-200) || 'Processing'}
Type: ${artifactData.artifactType || 'data'}
Summary: ${JSON.stringify(artifactData.summaryProps, null, 2)}
Full: ${JSON.stringify(artifactData.fullProps, null, 2)}

Make it specific and relevant.`;

          const model = ModelFactory.createModel(
            this.statusUpdateState?.summarizerModel || { model: 'openai/gpt-4.1-nano-2025-04-14' }
          );

          const schema = z.object({
            name: z.string().max(50).describe('Concise, descriptive name for the artifact'),
            description: z
              .string()
              .max(150)
              .describe("Brief description of the artifact's relevance to the user's question"),
          });

          // Add nested span for LLM generation
          const { object: result } = await tracer.startActiveSpan(
            createSpanName('graph_session.generate_artifact_metadata'),
            {
              attributes: {
                'llm.model':
                  this.statusUpdateState?.summarizerModel?.model ||
                  'openai/gpt-4.1-nano-2025-04-14',
                'llm.operation': 'generate_object',
                'artifact.id': artifactData.artifactId,
                'prompt.length': prompt.length,
              },
            },
            async (generationSpan) => {
              try {
                const result = await generateObject({
                  model,
                  prompt,
                  schema,
                  experimental_telemetry: {
                    isEnabled: true,
                    functionId: `artifact_processing_${artifactData.artifactId}`,
                    recordInputs: true,
                    recordOutputs: true,
                    metadata: {
                      operation: 'artifact_name_description_generation',
                      sessionId: this.sessionId,
                    },
                  },
                });

                generationSpan.setAttributes({
                  'generation.name_length': result.object.name.length,
                  'generation.description_length': result.object.description.length,
                });

                generationSpan.setStatus({ code: SpanStatusCode.OK });
                return result;
              } catch (error) {
                handleSpanError(generationSpan, error);
                throw error;
              } finally {
                generationSpan.end();
              }
            }
          );

          // Now save the artifact to the ledger with the generated name and description
          const { addLedgerArtifacts } = await import('@inkeep/agents-core');

          const artifactToSave: Artifact = {
            artifactId: artifactData.artifactId,
            name: result.name,
            description: result.description,
            type: 'source',
            taskId: artifactData.taskId,
            parts: [
              {
                kind: 'data',
                data: {
                  summary: artifactData.summaryProps || {},
                  full: artifactData.fullProps || {},
                },
              },
            ],
            metadata: artifactData.metadata || {},
          };

          await addLedgerArtifacts(dbClient)({
            scopes: {
              tenantId: artifactData.tenantId,
              projectId: artifactData.projectId,
            },
            contextId: artifactData.contextId,
            taskId: artifactData.taskId,
            artifacts: [artifactToSave],
          });

          logger.info(
            {
              sessionId: this.sessionId,
              artifactId: artifactData.artifactId,
              name: result.name,
              description: result.description,
            },
            'Artifact successfully saved to ledger with generated name and description'
          );

          // Mark main span as successful
          span.setAttributes({
            'artifact.name': result.name,
            'artifact.description': result.description,
            'processing.success': true,
          });
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          // Handle span error
          handleSpanError(span, error);
          logger.error(
            {
              sessionId: this.sessionId,
              artifactId: artifactData.artifactId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to process artifact'
          );

          // Fallback: save artifact with basic info
          try {
            const { addLedgerArtifacts } = await import('@inkeep/agents-core');

            const fallbackArtifact: Artifact = {
              artifactId: artifactData.artifactId,
              name: `Artifact ${artifactData.artifactId.substring(0, 8)}`,
              description: `${artifactData.artifactType || 'Data'} from ${artifactData.metadata?.toolName || 'tool results'}`,
              taskId: artifactData.taskId,
              parts: [
                {
                  kind: 'data',
                  data: {
                    summary: artifactData.summaryProps || {},
                    full: artifactData.fullProps || {},
                  },
                },
              ],
              metadata: artifactData.metadata || {},
            };

            if (artifactData.tenantId && artifactData.projectId) {
              await addLedgerArtifacts(dbClient)({
                scopes: {
                  tenantId: artifactData.tenantId,
                  projectId: artifactData.projectId,
                },
                contextId: artifactData.contextId || 'unknown',
                taskId: artifactData.taskId,
                artifacts: [fallbackArtifact],
              });

              logger.info(
                {
                  sessionId: this.sessionId,
                  artifactId: artifactData.artifactId,
                },
                'Saved artifact with fallback name/description after processing error'
              );
            }
          } catch (fallbackError) {
            logger.error(
              {
                sessionId: this.sessionId,
                artifactId: artifactData.artifactId,
                error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
              },
              'Failed to save artifact even with fallback'
            );
          }
        } finally {
          // Always end the main span
          span.end();
        }
      }
    );
  }
}

/**
 * Manages GraphSession instances for message-level tracking
 */
export class GraphSessionManager {
  private sessions = new Map<string, GraphSession>();

  /**
   * Create a new session for a message
   */
  createSession(
    messageId: string,
    graphId?: string,
    tenantId?: string,
    projectId?: string
  ): string {
    const sessionId = messageId; // Use messageId directly as sessionId
    const session = new GraphSession(sessionId, messageId, graphId, tenantId, projectId);
    this.sessions.set(sessionId, session);

    logger.info({ sessionId, messageId, graphId, tenantId, projectId }, 'GraphSession created');
    return sessionId;
  }

  /**
   * Initialize status updates for a session
   */
  initializeStatusUpdates(
    sessionId: string,
    config: StatusUpdateSettings,
    summarizerModel?: ModelSettings
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.initializeStatusUpdates(config, summarizerModel);
    } else {
      logger.error(
        {
          sessionId,
          availableSessions: Array.from(this.sessions.keys()),
        },
        'Session not found for status updates initialization'
      );
    }
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): GraphSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Record an event in a session
   */
  recordEvent(
    sessionId: string,
    eventType: GraphSessionEventType,
    agentId: string,
    data: EventData
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Attempted to record event in non-existent session');
      return;
    }

    session.recordEvent(eventType, agentId, data);
  }

  /**
   * End a session and return the final event data
   */
  endSession(sessionId: string): GraphSessionEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Attempted to end non-existent session');
      return [];
    }

    const events = session.getEvents();
    const summary = session.getSummary();

    logger.info({ sessionId, summary }, 'GraphSession ended');

    // Clean up session resources including status update timers
    session.cleanup();

    // Clean up the session from memory
    this.sessions.delete(sessionId);

    return events;
  }

  /**
   * Set text streaming state for a session
   */
  setTextStreaming(sessionId: string, isStreaming: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.setTextStreaming(isStreaming);
    }
  }

  /**
   * Get summary of all active sessions
   */
  getActiveSessions(): Array<{ sessionId: string; messageId: string; eventCount: number }> {
    return Array.from(this.sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      messageId: session.messageId,
      eventCount: session.getEvents().length,
    }));
  }
}

// Global instance
export const graphSessionManager = new GraphSessionManager();

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
  | 'agent_reasoning'
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
  | AgentReasoningData
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
  generationType: 'text_generation' | 'object_generation';
}

export interface AgentReasoningData {
  parts: Array<{
    type: 'text' | 'tool_call' | 'tool_result';
    content?: string;
    toolName?: string;
    args?: any;
    result?: any;
  }>;
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
  baseModel?: ModelSettings;
  updateLock?: boolean;  // Atomic lock for status updates
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
  private pendingArtifacts = new Set<string>(); // Track pending artifact processing
  private artifactProcessingErrors = new Map<string, number>(); // Track errors per artifact
  private readonly MAX_ARTIFACT_RETRIES = 3;
  private readonly MAX_PENDING_ARTIFACTS = 100; // Prevent unbounded growth
  private scheduledTimeouts?: Set<NodeJS.Timeout>; // Track scheduled timeouts for cleanup

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
  initializeStatusUpdates(config: StatusUpdateSettings, summarizerModel?: ModelSettings, baseModel?: ModelSettings): void {
    const now = Date.now();
    this.statusUpdateState = {
      lastUpdateTime: now,
      lastEventCount: 0,
      startTime: now,
      summarizerModel,
      baseModel,
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
      const artifactId = (data as ArtifactSavedData).artifactId;
      
      // Check for backpressure - prevent unbounded growth of pending artifacts
      if (this.pendingArtifacts.size >= this.MAX_PENDING_ARTIFACTS) {
        logger.warn({
          sessionId: this.sessionId,
          artifactId,
          pendingCount: this.pendingArtifacts.size,
          maxAllowed: this.MAX_PENDING_ARTIFACTS
        }, 'Too many pending artifacts, skipping processing');
        return;
      }
      
      // Track this artifact as pending
      this.pendingArtifacts.add(artifactId);
      
      // Fire and forget - process artifact completely asynchronously without any blocking
      setImmediate(() => {
        // No await, no spans at trigger level - truly fire and forget
        this.processArtifact(data as ArtifactSavedData)
          .then(() => {
            // Remove from pending on success
            this.pendingArtifacts.delete(artifactId);
            this.artifactProcessingErrors.delete(artifactId);
          })
          .catch((error) => {
            // Track error count
            const errorCount = (this.artifactProcessingErrors.get(artifactId) || 0) + 1;
            this.artifactProcessingErrors.set(artifactId, errorCount);
            
            // Remove from pending after max retries
            if (errorCount >= this.MAX_ARTIFACT_RETRIES) {
              this.pendingArtifacts.delete(artifactId);
              logger.error({
              sessionId: this.sessionId,
                artifactId,
                errorCount,
                maxRetries: this.MAX_ARTIFACT_RETRIES,
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              }, 'Artifact processing failed after max retries, giving up');
            } else {
              // Keep in pending for potential retry
              logger.warn({
                sessionId: this.sessionId,
                artifactId,
                errorCount,
                error: error instanceof Error ? error.message : 'Unknown error',
              }, 'Artifact processing failed, may retry');
            }
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

    // Schedule async update check with proper error handling
    this.scheduleStatusUpdateCheck(statusUpdateState);
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
    
    // Clean up artifact tracking maps to prevent memory leaks
    this.pendingArtifacts.clear();
    this.artifactProcessingErrors.clear();
    
    // Clear any scheduled timeouts to prevent race conditions
    if (this.scheduledTimeouts) {
      for (const timeoutId of this.scheduledTimeouts) {
        clearTimeout(timeoutId);
      }
      this.scheduledTimeouts.clear();
    }
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
                label: op.data.label,
                data: Object.fromEntries(
                  Object.entries(op.data).filter(([key]) => !['label', 'type'].includes(key))
                ),
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
   * Schedule status update check without setImmediate race conditions
   */
  private scheduleStatusUpdateCheck(statusUpdateState: StatusUpdateState): void {
    // Use setTimeout with 0 delay instead of setImmediate for better control
    const timeoutId = setTimeout(async () => {
      try {
        // Double-check session is still valid before proceeding
        if (this.isEnded || !this.statusUpdateState) {
          return;
        }

        // Acquire update lock with atomic check
        if (!this.acquireUpdateLock()) {
          return; // Another update is in progress
        }

        try {
          // Final validation before processing
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
        } finally {
          // Always release the lock
          this.releaseUpdateLock();
        }
      } catch (error) {
        logger.error(
          {
            sessionId: this.sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to check status updates during event recording'
        );
        // Ensure lock is released on error
        this.releaseUpdateLock();
      }
    }, 0);

    // Track timeout for cleanup if session ends
    if (!this.scheduledTimeouts) {
      this.scheduledTimeouts = new Set();
    }
    this.scheduledTimeouts.add(timeoutId);

    // Auto-cleanup timeout reference
    setTimeout(() => {
      if (this.scheduledTimeouts) {
        this.scheduledTimeouts.delete(timeoutId);
      }
    }, 1000);
  }

  /**
   * Acquire update lock with atomic check
   */
  private acquireUpdateLock(): boolean {
    // Atomic check-and-set
    if (this.statusUpdateState?.updateLock) {
      return false; // Already locked
    }
    if (this.statusUpdateState) {
      this.statusUpdateState.updateLock = true;
    }
    return true;
  }

  /**
   * Release update lock
   */
  private releaseUpdateLock(): void {
    if (this.statusUpdateState) {
      this.statusUpdateState.updateLock = false;
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
          'llm.model': summarizerModel?.model,
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
          const basePrompt = `Generate a meaningful status update that tells the user what specific information or result was just found/achieved.${conversationContext}${previousSummaries.length > 0 ? `\n${previousSummaryContext}` : ''}

Activities:\n${userVisibleActivities.join('\n') || 'No New Activities'}

Describe the ACTUAL finding, result, or specific information discovered (e.g., "Found Slack bot requires admin permissions", "Identified 3 channel types for ingestion", "Configuration requires OAuth token").

${this.statusUpdateState?.config.prompt?.trim() || ''}`;

          const prompt = basePrompt;

          // Use summarizer model if available, otherwise fall back to base model
          let modelToUse = summarizerModel;
          if (!summarizerModel?.model?.trim()) {
            if (!this.statusUpdateState?.baseModel?.model?.trim()) {
              throw new Error('Either summarizer or base model is required for progress summary generation. Please configure models at the project level.');
            }
            modelToUse = this.statusUpdateState.baseModel;
          }
          const model = ModelFactory.createModel(modelToUse!);

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
          'llm.model': summarizerModel?.model,
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
                component.type,
                this.getComponentSchema(component)
                  .optional()
                  .describe(component.description || component.type),
              ]),
            ])
          );

          // Use custom prompt if provided, otherwise use default
          const basePrompt = `Generate status updates for relevant components based on what the user has asked for.${conversationContext}${previousSummaries.length > 0 ? `\n${previousSummaryContext}` : ''}

Activities:\n${userVisibleActivities.join('\n') || 'No New Activities'}

Available components: no_relevant_updates, ${statusComponents.map((c) => c.type).join(', ')}

Rules:
- Fill in data for relevant components only
- Use 'no_relevant_updates' if nothing substantially new to report. DO NOT WRITE LABELS OR USE OTHER COMPONENTS IF YOU USE THIS COMPONENT.
- Never repeat previous values, make every update EXTREMELY unique. If you cannot do that the update is not worth mentioning.
- Labels MUST contain the ACTUAL information discovered ("Found X", "Learned Y", "Discovered Z requires A")
- DO NOT use action words like "Searching", "Processing", "Analyzing" - state what was FOUND
- Include specific details, numbers, requirements, or insights discovered
- You are ONE AI (no agents/delegations)
- Anonymize all internal operations so that the information appears descriptive and USER FRIENDLY. HIDE INTERNAL OPERATIONS!
- Bad examples: "Searching docs", "Processing request", "Status update", or not using the no_relevant_updates: e.g. "No New Updates", "No new info to report"
- Good examples: "Slack bot needs admin privileges", "Found 3-step OAuth flow required", "Channel limit is 500 per workspace", or use the no_relevant_updates component if nothing new to report.

REMEMBER YOU CAN ONLY USE 'no_relevant_updates' ALONE! IT CANNOT BE CONCATENATED WITH OTHER STATUS UPDATES!

${this.statusUpdateState?.config.prompt?.trim() || ''}`;

          const prompt = basePrompt;

          // Use summarizer model if available, otherwise fall back to base model
          let modelToUse = summarizerModel;
          if (!summarizerModel?.model?.trim()) {
            if (!this.statusUpdateState?.baseModel?.model?.trim()) {
              throw new Error('Either summarizer or base model is required for status update generation. Please configure models at the project level.');
            }
            modelToUse = this.statusUpdateState.baseModel;
          }
          const model = ModelFactory.createModel(modelToUse!);

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
   * Build Zod schema from JSON schema configuration or use pre-defined schemas
   */
  private getComponentSchema(component: StatusComponent): z.ZodType<any> {
    // Check if we have a JSON schema to convert
    if (component.detailsSchema && 'properties' in component.detailsSchema) {
      return this.buildZodSchemaFromJson(component.detailsSchema);
    }

    // Fallback to a simple object with just label if no schema provided
    return z.object({
      label: z
        .string()
        .describe(
          'A short 3-5 word phrase, that is a descriptive label for the update component. This Label must be EXTREMELY unique to represent the UNIQUE update we are providing. The ACTUAL finding or result, not the action. What specific information was discovered? (e.g., "Slack requires OAuth 2.0 setup", "Found 5 integration methods", "API rate limit is 100/minute"). Include the actual detail or insight, not just that you searched or processed.'
        ),
    });
  }

  /**
   * Build Zod schema from JSON schema with improved type handling
   */
  private buildZodSchemaFromJson(jsonSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  }): z.ZodType<any> {
    const properties: Record<string, z.ZodType<any>> = {};

    // Always add label field
    properties['label'] = z
      .string()
      .describe(
        'A short 3-5 word phrase, that is a descriptive label for the update component. This Label must be EXTREMELY unique to represent the UNIQUE update we are providing. The SPECIFIC finding, result, or insight discovered (e.g., "Slack bot needs workspace admin role", "Found ingestion requires 3 steps", "Channel history limited to 10k messages"). State the ACTUAL information found, not that you searched. What did you LEARN or DISCOVER? What specific detail is now known?'
      );

    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      let zodType: z.ZodType<any>;

      // Check for enum first
      if (value.enum && Array.isArray(value.enum)) {
        // Handle enum types
        if (value.enum.length === 1) {
          zodType = z.literal(value.enum[0]);
        } else {
          const [first, ...rest] = value.enum;
          zodType = z.enum([first, ...rest] as [string, ...string[]]);
        }
      } else if (value.type === 'string') {
        zodType = z.string();
        // Add string-specific validations if present
        if (value.minLength) zodType = (zodType as z.ZodString).min(value.minLength);
        if (value.maxLength) zodType = (zodType as z.ZodString).max(value.maxLength);
        if (value.format === 'email') zodType = (zodType as z.ZodString).email();
        if (value.format === 'url' || value.format === 'uri')
          zodType = (zodType as z.ZodString).url();
      } else if (value.type === 'number' || value.type === 'integer') {
        zodType = value.type === 'integer' ? z.number().int() : z.number();
        // Add number-specific validations if present
        if (value.minimum !== undefined) zodType = (zodType as z.ZodNumber).min(value.minimum);
        if (value.maximum !== undefined) zodType = (zodType as z.ZodNumber).max(value.maximum);
      } else if (value.type === 'boolean') {
        zodType = z.boolean();
      } else if (value.type === 'array') {
        // Handle array items if specified
        if (value.items) {
          if (value.items.enum && Array.isArray(value.items.enum)) {
            // Array of enum values
            const [first, ...rest] = value.items.enum;
            zodType = z.array(z.enum([first, ...rest] as [string, ...string[]]));
          } else if (value.items.type === 'string') {
            zodType = z.array(z.string());
          } else if (value.items.type === 'number') {
            zodType = z.array(z.number());
          } else if (value.items.type === 'boolean') {
            zodType = z.array(z.boolean());
          } else if (value.items.type === 'object') {
            zodType = z.array(z.record(z.string(), z.any()));
          } else {
            zodType = z.array(z.any());
          }
        } else {
          zodType = z.array(z.any());
        }
        // Add array-specific validations
        if (value.minItems) zodType = (zodType as z.ZodArray<any>).min(value.minItems);
        if (value.maxItems) zodType = (zodType as z.ZodArray<any>).max(value.maxItems);
      } else if (value.type === 'object') {
        zodType = z.record(z.string(), z.any());
      } else {
        zodType = z.any();
      }

      // Add description if present in JSON schema
      if (value.description) {
        zodType = zodType.describe(value.description);
      }

      // Make optional if not in required array OR if marked as optional
      if (!jsonSchema.required?.includes(key) || value.optional === true) {
        zodType = zodType.optional();
      }

      properties[key] = zodType;
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

        case 'agent_reasoning': {
          const data = event.data as AgentReasoningData;
          activities.push(
            `⚙️ **Reasoning**: reasoning\n` +
              `   Full Details: ${JSON.stringify(data.parts, null, 2)}`
          );
          break;
        }

        case 'agent_generate': {
          const data = event.data as AgentGenerateData;
          activities.push(
            `⚙️ **Generation**: ${data.generationType}\n` +
              `   Full Details: ${JSON.stringify(data.parts, null, 2)}`
          );
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

          const { getFormattedConversationHistory } = await import('../data/conversations.js');
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

          // Find the specific tool call that generated this artifact
          // Now toolId and toolCallId should be the same since we use AI SDK's toolCallId consistently
          const toolCallEvent = this.events.find(
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

          const prompt = `Name this artifact (max 50 chars) and describe it (max 150 chars).

Tool Context: ${toolContext ? JSON.stringify(toolContext, null, 2) : 'No tool context'}
Context: ${conversationHistory?.slice(-200) || 'Processing'}
Type: ${artifactData.artifactType || 'data'}
Summary: ${JSON.stringify(artifactData.summaryProps, null, 2)}
Full: ${JSON.stringify(artifactData.fullProps, null, 2)}

Make it specific and relevant.`;

          // Use summarizer model if available, otherwise fall back to base model
          let modelToUse = this.statusUpdateState?.summarizerModel;
          if (!modelToUse?.model?.trim()) {
            if (!this.statusUpdateState?.baseModel?.model?.trim()) {
              throw new Error('Either summarizer or base model is required for artifact name generation. Please configure models at the project level.');
            }
            modelToUse = this.statusUpdateState.baseModel;
          }
          const model = ModelFactory.createModel(modelToUse!);

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
                'llm.model': this.statusUpdateState?.summarizerModel?.model,
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

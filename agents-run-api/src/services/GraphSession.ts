import type {
  Artifact,
  ModelSettings,
  StatusComponent,
  StatusUpdateSettings,
  SummaryEvent,
} from '@inkeep/agents-core';
import { getAgentById } from '@inkeep/agents-core';
import { SpanStatusCode } from '@opentelemetry/api';
import { generateObject } from 'ai';
import { z } from 'zod';
import { ModelFactory } from '../agents/ModelFactory';
import { toolSessionManager } from '../agents/ToolSessionManager';
import { getFormattedConversationHistory } from '../data/conversations';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { defaultStatusSchemas } from '../utils/default-status-schemas';
import { getStreamHelper } from '../utils/stream-registry';
import { setSpanWithError, tracer } from '../utils/tracer';
import { ArtifactParser } from './ArtifactParser';
import { ArtifactService } from './ArtifactService';

const logger = getLogger('GraphSession');

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
  toolCallId?: string;
  artifactType: string;
  summaryData?: Record<string, any>;
  fullData?: Record<string, any>;
  pendingGeneration?: boolean;
  tenantId?: string;
  projectId?: string;
  contextId?: string;
  agentId?: string;
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
  updateLock?: boolean; // Atomic lock for status updates
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
  private scheduledTimeouts?: Set<ReturnType<typeof setTimeout>>; // Track scheduled timeouts for cleanup
  private artifactCache = new Map<string, any>(); // Cache artifacts created in this session
  private artifactService?: any; // Session-scoped ArtifactService instance
  private artifactParser?: any; // Session-scoped ArtifactParser instance

  constructor(
    public readonly sessionId: string,
    public readonly messageId: string,
    public readonly graphId?: string,
    public readonly tenantId?: string,
    public readonly projectId?: string,
    public readonly contextId?: string
  ) {
    logger.debug({ sessionId, messageId, graphId }, 'GraphSession created');

    // Initialize session-scoped services if we have required context
    if (tenantId && projectId) {
      // Create the shared ToolSession for this graph execution
      // All agents in this execution will use this same session

      toolSessionManager.createSessionWithId(
        sessionId,
        tenantId,
        projectId,
        contextId || 'default',
        `task_${contextId}-${messageId}` // Create a taskId based on context and message
      );

      // Create ArtifactService that uses this ToolSession
      this.artifactService = new ArtifactService({
        tenantId,
        projectId,
        sessionId: sessionId, // Same ID as ToolSession
        contextId,
        taskId: `task_${contextId}-${messageId}`,
        streamRequestId: sessionId,
      });

      // Create ArtifactParser that uses the session-scoped ArtifactService
      this.artifactParser = new ArtifactParser(tenantId, {
        projectId,
        sessionId: sessionId,
        contextId,
        taskId: `task_${contextId}-${messageId}`,
        streamRequestId: sessionId,
      });
    }
  }

  /**
   * Initialize status updates for this session
   */
  initializeStatusUpdates(
    config: StatusUpdateSettings,
    summarizerModel?: ModelSettings,
    baseModel?: ModelSettings
  ): void {
    const now = Date.now();
    this.statusUpdateState = {
      lastUpdateTime: now,
      lastEventCount: 0,
      startTime: now,
      summarizerModel,
      baseModel,
      config: {
        numEvents: config.numEvents || 1,
        timeInSeconds: config.timeInSeconds || 2,
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
        logger.warn(
          {
            sessionId: this.sessionId,
            artifactId,
            pendingCount: this.pendingArtifacts.size,
            maxAllowed: this.MAX_PENDING_ARTIFACTS,
          },
          'Too many pending artifacts, skipping processing'
        );
        return;
      }

      // Track this artifact as pending
      this.pendingArtifacts.add(artifactId);

      // Fire and forget - process artifact completely asynchronously without any blocking
      setImmediate(() => {
        // No await, no spans at trigger level - truly fire and forget
        // Include agentId from the event in the artifact data
        const artifactDataWithAgent = { ...(data as ArtifactSavedData), agentId };
        this.processArtifact(artifactDataWithAgent)
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
              logger.error(
                {
                  sessionId: this.sessionId,
                  artifactId,
                  errorCount,
                  maxRetries: this.MAX_ARTIFACT_RETRIES,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  stack: error instanceof Error ? error.stack : undefined,
                },
                'Artifact processing failed after max retries, giving up'
              );
            } else {
              // Keep in pending for potential retry
              logger.warn(
                {
                  sessionId: this.sessionId,
                  artifactId,
                  errorCount,
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Artifact processing failed, may retry'
              );
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

    // Clear artifact cache for this session
    this.artifactCache.clear();

    // Clean up the ToolSession that this GraphSession created
    if (this.sessionId) {
      toolSessionManager.endSession(this.sessionId);
    }

    // Clear any scheduled timeouts to prevent race conditions
    if (this.scheduledTimeouts) {
      for (const timeoutId of this.scheduledTimeouts) {
        clearTimeout(timeoutId);
      }
      this.scheduledTimeouts.clear();
    }

    // Clear static caches from ArtifactService to prevent memory leaks
    if (this.artifactService) {
      // Use the session-scoped instance
      this.artifactService.constructor.clearCaches();
      this.artifactService = undefined;
    } else {
      // Fallback to static class if session service wasn't initialized
      ArtifactService.clearCaches();
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

      // Use default status schemas if no custom ones are configured
      const statusComponents =
        statusUpdateState.config.statusComponents &&
        statusUpdateState.config.statusComponents.length > 0
          ? statusUpdateState.config.statusComponents
          : defaultStatusSchemas;

      // Generate structured status update using configured or default schemas
      const result = await this.generateStructuredStatusUpdate(
        this.events.slice(statusUpdateState.lastEventCount),
        elapsedTime,
        statusComponents,
        statusUpdateState.summarizerModel,
        this.previousSummaries
      );

      if (result.summaries && result.summaries.length > 0) {
        // Send each operation separately using writeData for dynamic types
        for (const summary of result.summaries) {
          // Guard against empty/invalid operations
          if (
            !summary ||
            !summary.type ||
            !summary.data ||
            !summary.data.label ||
            Object.keys(summary.data).length === 0
          ) {
            logger.warn(
              {
                sessionId: this.sessionId,
                summary: summary,
              },
              'Skipping empty or invalid structured operation'
            );
            continue;
          }

          const summaryToSend = {
            type: summary.data.type || summary.type, // Preserve the actual custom type from LLM
            label: summary.data.label,
            details: Object.fromEntries(
              Object.entries(summary.data).filter(([key]) => !['label', 'type'].includes(key))
            ),
          };

          await streamHelper.writeSummary(summaryToSend as SummaryEvent);
        }

        // Store summaries for next time - use full JSON for better comparison
        const summaryTexts = result.summaries.map((summary) =>
          JSON.stringify({ type: summary.type, data: summary.data })
        );
        this.previousSummaries.push(...summaryTexts);

        // Update state after sending all operations
        if (this.statusUpdateState) {
          this.statusUpdateState.lastUpdateTime = now;
          this.statusUpdateState.lastEventCount = this.events.length;
        }

        return;
      }

      // Keep only last 3 summaries to avoid context getting too large
      if (this.previousSummaries.length > 3) {
        this.previousSummaries.shift();
      }

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
   * Generate structured status update using configured data components
   */
  private async generateStructuredStatusUpdate(
    newEvents: GraphSessionEvent[],
    elapsedTime: number,
    statusComponents: StatusComponent[],
    summarizerModel?: ModelSettings,
    previousSummaries: string[] = []
  ): Promise<{ summaries: Array<{ type: string; data: Record<string, any> }> }> {
    return tracer.startActiveSpan(
      'graph_session.generate_structured_update',
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
- Labels MUST be short 3-7 word phrases with ACTUAL information discovered. NEVER MAKE UP SOMETHING WITHOUT BACKING IT UP WITH ACTUAL INFORMATION.
- Use sentence case: only capitalize the first word and proper nouns (e.g., "Admin permissions required", not "Admin Permissions Required"). ALWAYS capitalize the first word of the label.
- DO NOT use action words like "Searching", "Processing", "Analyzing" - state what was FOUND
- Include specific details, numbers, requirements, or insights discovered
- Examples: "Admin permissions required", "Three OAuth steps found", "Token expires daily"

CRITICAL - HIDE ALL INTERNAL SYSTEM OPERATIONS:
- You are ONE unified AI system presenting results to the user
- ABSOLUTELY FORBIDDEN WORDS/PHRASES: "transfer", "transferring", "delegation", "delegating", "delegate", "agent", "routing", "route", "artifact", "saving artifact", "stored artifact", "artifact saved", "continuing", "passing to", "handing off", "switching to"
- NEVER reveal internal architecture: No mentions of different agents, components, systems, or modules working together
- NEVER mention artifact operations: Users don't need to know about data being saved, stored, or organized internally
- NEVER describe handoffs or transitions: Present everything as one seamless operation
- If you see "transfer", "delegation_sent", "delegation_returned", or "artifact_saved" events - IGNORE THEM or translate to user-facing information only
- Focus ONLY on actual discoveries, findings, and results that matter to the user

- Bad examples: 
  * "Transferring to search agent"
  * "Delegating research task" 
  * "Routing to QA specialist"
  * "Artifact saved successfully"
  * "Storing results for later"
  * "Passing request to tool handler"
  * "Continuing with analysis"
  * "Handing off to processor"
- Good examples:
  * "Slack bot needs admin privileges"
  * "Found 3-step OAuth flow required"  
  * "Channel limit is 500 per workspace"
  * Use no_relevant_updates if nothing new to report

CRITICAL ANTI-HALLUCINATION RULES:
- NEVER MAKE UP SOMETHING WITHOUT BACKING IT UP WITH ACTUAL INFORMATION. EVERY SINGLE UPDATE MUST BE BACKED UP WITH ACTUAL INFORMATION.
- DO NOT MAKE UP PEOPLE, NAMES, PLACES, THINGS, ORGANIZATIONS, OR INFORMATION. IT IS OBVIOUS WHEN A PERSON/ENTITY DOES NOT EXIST.
- Only report facts that are EXPLICITLY mentioned in the activities or tool results
- If you don't have concrete information about something, DO NOT mention it
- Never invent names like "John Doe", "Alice", "Bob", or any other placeholder names
- Never create fictional companies, products, or services
- If a tool returned no results or an error, DO NOT pretend it found something
- Every detail in your status update must be traceable back to the actual activities provided

REMEMBER YOU CAN ONLY USE 'no_relevant_updates' ALONE! IT CANNOT BE CONCATENATED WITH OTHER STATUS UPDATES!

${this.statusUpdateState?.config.prompt?.trim() || ''}`;

          const prompt = basePrompt;

          // Use summarizer model if available, otherwise fall back to base model
          let modelToUse = summarizerModel;
          if (!summarizerModel?.model?.trim()) {
            if (!this.statusUpdateState?.baseModel?.model?.trim()) {
              throw new Error(
                'Either summarizer or base model is required for status update generation. Please configure models at the project level.'
              );
            }
            modelToUse = this.statusUpdateState.baseModel;
          }

          if (!modelToUse) {
            throw new Error('No model configuration available');
          }
          const model = ModelFactory.createModel(modelToUse);

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
          const summaries = [];
          for (const [componentId, data] of Object.entries(result)) {
            // Skip no_relevant_updates - we don't send any operation for this
            if (componentId === 'no_relevant_updates') {
              continue;
            }

            // Only include components that have actual data
            if (data && typeof data === 'object' && Object.keys(data).length > 0) {
              summaries.push({
                type: componentId,
                data: data,
              });
            }
          }

          span.setAttributes({
            'summaries.count': summaries.length,
            'user_activities.count': userVisibleActivities.length,
            'result_keys.count': Object.keys(result).length,
          });
          span.setStatus({ code: SpanStatusCode.OK });

          return { summaries };
        } catch (error) {
          setSpanWithError(span, error);
          logger.error({ error }, 'Failed to generate structured update, using fallback');
          return { summaries: [] };
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
          'A short 3-5 word phrase, that is a descriptive label for the update component. This Label must be EXTREMELY unique to represent the UNIQUE update we are providing. The ACTUAL finding or result, not the action. What specific information was discovered? (e.g., "Slack requires OAuth 2.0 setup", "Found 5 integration methods", "API rate limit is 100/minute"). Include the actual detail or insight, not just that you searched or processed. CRITICAL: Only use facts explicitly found in the activities - NEVER invent names, people, organizations, or details that are not present in the actual tool results.'
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
        'A short 3-5 word phrase, that is a descriptive label for the update component. This Label must be EXTREMELY unique to represent the UNIQUE update we are providing. The SPECIFIC finding, result, or insight discovered (e.g., "Slack bot needs workspace admin role", "Found ingestion requires 3 steps", "Channel history limited to 10k messages"). State the ACTUAL information found, not that you searched. What did you LEARN or DISCOVER? What specific detail is now known? CRITICAL: Only use facts explicitly found in the activities - NEVER invent names, people, organizations, or details that are not present in the actual tool results.'
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

        // INTERNAL OPERATIONS - DO NOT EXPOSE TO STATUS UPDATES
        case 'transfer':
        case 'delegation_sent':
        case 'delegation_returned':
        case 'artifact_saved':
          // These are internal system operations that should never be visible in status updates
          // Skip them entirely - they don't produce user-facing activities
          break;

        case 'agent_reasoning': {
          const data = event.data as AgentReasoningData;
          // Present as analysis without mentioning agents
          activities.push(
            `⚙️ **Analyzing request**\n` + `   Details: ${JSON.stringify(data.parts, null, 2)}`
          );
          break;
        }

        case 'agent_generate': {
          const data = event.data as AgentGenerateData;
          // Present as response preparation without mentioning agents
          activities.push(
            `⚙️ **Preparing response**\n` + `   Details: ${JSON.stringify(data.parts, null, 2)}`
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
   * Process a single artifact to generate name and description using conversation context
   */
  private async processArtifact(artifactData: ArtifactSavedData): Promise<void> {
    return tracer.startActiveSpan(
      'graph_session.process_artifact',
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

          let mainSaveSucceeded = false;

          // getFormattedConversationHistory is already imported at the top
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
              // Try to get agent model configuration if statusUpdateState is not available
              if (artifactData.agentId && artifactData.tenantId && artifactData.projectId) {
                try {
                  const agentData = await getAgentById(dbClient)({
                    scopes: {
                      tenantId: artifactData.tenantId,
                      projectId: artifactData.projectId,
                      graphId: this.graphId || '',
                    },
                    agentId: artifactData.agentId,
                  });
                  
                  if (agentData && 'models' in agentData && agentData.models?.base?.model) {
                    modelToUse = agentData.models.base;
                    logger.info(
                      {
                        sessionId: this.sessionId,
                        artifactId: artifactData.artifactId,
                        agentId: artifactData.agentId,
                        model: modelToUse.model,
                      },
                      'Using agent model configuration for artifact name generation'
                    );
                  }
                } catch (error) {
                  logger.warn(
                    { 
                      sessionId: this.sessionId, 
                      artifactId: artifactData.artifactId,
                      agentId: artifactData.agentId,
                      error: error instanceof Error ? error.message : 'Unknown error'
                    },
                    'Failed to get agent model configuration'
                  );
                }
              }
              
              if (!modelToUse?.model?.trim()) {
                logger.warn(
                  {
                    sessionId: this.sessionId,
                    artifactId: artifactData.artifactId,
                  },
                  'No model configuration available for artifact name generation, will use fallback names'
                );
                // Skip name generation and use fallback
                modelToUse = undefined;
              }
            } else {
              modelToUse = this.statusUpdateState.baseModel;
            }
          }

          let result: { name: string; description: string };
          if (!modelToUse) {
            // Use fallback name/description
            result = {
              name: `Artifact ${artifactData.artifactId.substring(0, 8)}`,
              description: `${artifactData.artifactType || 'Data'} from ${artifactData.metadata?.toolCallId || 'tool results'}`,
            };
          } else {
            const model = ModelFactory.createModel(modelToUse);

            const schema = z.object({
              name: z.string().describe('Concise, descriptive name for the artifact'),
              description: z
                .string()
                .describe("Brief description of the artifact's relevance to the user's question"),
            });

            // Add nested span for LLM generation with retry logic
            const { object } = await tracer.startActiveSpan(
            'graph_session.generate_artifact_metadata',
            {
              attributes: {
                'llm.model': this.statusUpdateState?.summarizerModel?.model,
                'llm.operation': 'generate_object',
                'artifact.id': artifactData.artifactId,
                'artifact.type': artifactData.artifactType,
                'artifact.summary': JSON.stringify(artifactData.summaryProps, null, 2),
                'artifact.full': JSON.stringify(artifactData.fullProps, null, 2),
                'prompt.length': prompt.length,
              },
            },
            async (generationSpan) => {
              const maxRetries = 3;
              let lastError: Error | null = null;

              for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
                        attempt,
                      },
                    },
                  });

                  generationSpan.setAttributes({
                    'artifact.id': artifactData.artifactId,
                    'artifact.type': artifactData.artifactType,
                    'artifact.name': result.object.name,
                    'artifact.description': result.object.description,
                    'artifact.summary': JSON.stringify(artifactData.summaryProps, null, 2),
                    'artifact.full': JSON.stringify(artifactData.fullProps, null, 2),
                    'generation.name_length': result.object.name.length,
                    'generation.description_length': result.object.description.length,
                    'generation.attempts': attempt,
                  });

                  generationSpan.setStatus({ code: SpanStatusCode.OK });
                  return result;
                } catch (error) {
                  lastError = error instanceof Error ? error : new Error(String(error));

                  logger.warn(
                    {
                      sessionId: this.sessionId,
                      artifactId: artifactData.artifactId,
                      attempt,
                      maxRetries,
                      error: lastError.message,
                    },
                    `Artifact name/description generation failed, attempt ${attempt}/${maxRetries}`
                  );

                  // If this isn't the last attempt, wait before retrying
                  if (attempt < maxRetries) {
                    const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 10000); // Exponential backoff, max 10s
                    await new Promise((resolve) => setTimeout(resolve, backoffMs));
                  }
                }
              }

              // All retries failed
              setSpanWithError(generationSpan, lastError);
              throw new Error(
                `Artifact name/description generation failed after ${maxRetries} attempts: ${lastError?.message}`
              );
            }
          );
          result = object;
          }

          // Now save the artifact using ArtifactService
          const artifactService = new ArtifactService({
            tenantId: artifactData.tenantId,
            projectId: artifactData.projectId,
            contextId: artifactData.contextId,
            taskId: artifactData.taskId,
            sessionId: this.sessionId,
          });

          try {
            await artifactService.saveArtifact({
              artifactId: artifactData.artifactId,
              name: result.name,
              description: result.description,
              type: artifactData.artifactType || 'source',
              summaryProps: artifactData.summaryProps || {},
              fullProps: artifactData.fullProps || {},
              metadata: artifactData.metadata || {},
            });

            mainSaveSucceeded = true;

            // Mark main span as successful
            span.setAttributes({
              'artifact.name': result.name,
              'artifact.description': result.description,
              'processing.success': true,
            });
            span.setStatus({ code: SpanStatusCode.OK });
          } catch (saveError) {
            logger.error(
              {
                sessionId: this.sessionId,
                artifactId: artifactData.artifactId,
                error: saveError instanceof Error ? saveError.message : 'Unknown error',
              },
              'Main artifact save failed, will attempt fallback'
            );
            // Don't throw here - let the fallback handle it
          }
          // Only attempt fallback save if main save failed
          if (!mainSaveSucceeded) {
            try {
              if (artifactData.tenantId && artifactData.projectId) {
                const artifactService = new ArtifactService({
                  tenantId: artifactData.tenantId,
                  projectId: artifactData.projectId,
                  contextId: artifactData.contextId || 'unknown',
                  taskId: artifactData.taskId,
                  sessionId: this.sessionId,
                });

                await artifactService.saveArtifact({
                  artifactId: artifactData.artifactId,
                  name: `Artifact ${artifactData.artifactId.substring(0, 8)}`,
                  description: `${artifactData.artifactType || 'Data'} from ${artifactData.metadata?.toolName || 'tool results'}`,
                  type: artifactData.artifactType || 'source',
                  summaryProps: artifactData.summaryProps || {},
                  fullProps: artifactData.fullProps || {},
                  metadata: artifactData.metadata || {},
                });

                logger.info(
                  {
                    sessionId: this.sessionId,
                    artifactId: artifactData.artifactId,
                  },
                  'Saved artifact with fallback name/description after main save failed'
                );
              }
            } catch (fallbackError) {
              // Check if this is a duplicate key error - if so, artifact may have been saved by another process
              const isDuplicateError =
                fallbackError instanceof Error &&
                (fallbackError.message?.includes('UNIQUE') ||
                  fallbackError.message?.includes('duplicate'));

              if (isDuplicateError) {
                // Duplicate key - artifact already exists, no action needed
              } else {
                logger.error(
                  {
                    sessionId: this.sessionId,
                    artifactId: artifactData.artifactId,
                    error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
                  },
                  'Failed to save artifact even with fallback'
                );
              }
            }
          }
        } catch (error) {
          // Handle span error (this is for name/description generation errors)
          setSpanWithError(span, error);
          logger.error(
            {
              sessionId: this.sessionId,
              artifactId: artifactData.artifactId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to process artifact (name/description generation failed)'
          );
        } finally {
          // Always end the main span
          span.end();
        }
      }
    );
  }

  /**
   * Cache an artifact in this session for immediate access
   */
  setArtifactCache(key: string, artifact: any): void {
    this.artifactCache.set(key, artifact);
    logger.debug({ sessionId: this.sessionId, key }, 'Artifact cached in session');
  }

  /**
   * Get session-scoped ArtifactService instance
   */
  getArtifactService(): any | null {
    return this.artifactService || null;
  }

  /**
   * Get session-scoped ArtifactParser instance
   */
  getArtifactParser(): any | null {
    return this.artifactParser || null;
  }

  /**
   * Get an artifact from this session cache
   */
  getArtifactCache(key: string): any | null {
    const artifact = this.artifactCache.get(key);
    logger.debug({ sessionId: this.sessionId, key, found: !!artifact }, 'Artifact cache lookup');
    return artifact || null;
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
    projectId?: string,
    contextId?: string
  ): string {
    const sessionId = messageId; // Use messageId directly as sessionId
    const session = new GraphSession(sessionId, messageId, graphId, tenantId, projectId, contextId);
    this.sessions.set(sessionId, session);

    logger.info(
      { sessionId, messageId, graphId, tenantId, projectId, contextId },
      'GraphSession created'
    );
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

  /**
   * Cache an artifact in the specified session
   */
  async setArtifactCache(sessionId: string, key: string, artifact: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.setArtifactCache(key, artifact);
    }
  }

  /**
   * Get an artifact from the specified session cache
   */
  async getArtifactCache(sessionId: string, key: string): Promise<any | null> {
    const session = this.sessions.get(sessionId);
    return session ? session.getArtifactCache(key) : null;
  }

  /**
   * Get session-scoped ArtifactService instance
   */
  getArtifactService(sessionId: string): any | null {
    const session = this.sessions.get(sessionId);
    return session ? session.getArtifactService() : null;
  }

  /**
   * Get session-scoped ArtifactParser instance
   */
  getArtifactParser(sessionId: string): any | null {
    const session = this.sessions.get(sessionId);
    return session ? session.getArtifactParser() : null;
  }
}

// Global instance
export const graphSessionManager = new GraphSessionManager();

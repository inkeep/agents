import type {
  DelegationReturnedData,
  DelegationSentData,
  ModelSettings,
  ResolvedRef,
  StatusComponent,
  StatusUpdateSettings,
  SummaryEvent,
  TransferData,
} from '@inkeep/agents-core';
import {
  CONVERSATION_HISTORY_DEFAULT_LIMIT,
  CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
  executeInBranch,
  getSubAgentById,
} from '@inkeep/agents-core';
import { SpanStatusCode } from '@opentelemetry/api';
import { generateObject } from 'ai';
import { z } from 'zod';
import { ModelFactory } from '../agents/ModelFactory';
import { toolSessionManager } from '../agents/ToolSessionManager';
import {
  ARTIFACT_GENERATION_BACKOFF_INITIAL_MS,
  ARTIFACT_GENERATION_BACKOFF_MAX_MS,
  ARTIFACT_GENERATION_MAX_RETRIES,
  ARTIFACT_SESSION_MAX_PENDING,
  ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES,
  STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS,
  STATUS_UPDATE_DEFAULT_NUM_EVENTS,
} from '../constants/execution-limits';
import { getFormattedConversationHistory } from '../data/conversations';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { defaultStatusSchemas } from '../utils/default-status-schemas';
import { getStreamHelper } from '../utils/stream-registry';
import { setSpanWithError, tracer } from '../utils/tracer';
import { ArtifactParser } from './ArtifactParser';
import { ArtifactService } from './ArtifactService';

const logger = getLogger('AgentSession');

export type AgentSessionEventType =
  | 'agent_generate'
  | 'agent_reasoning'
  | 'transfer'
  | 'delegation_sent'
  | 'delegation_returned'
  | 'artifact_saved'
  | 'tool_call'
  | 'tool_result'
  | 'error';

interface BaseAgentSessionEvent {
  timestamp: number;
  subAgentId: string;
}

export type AgentSessionEvent =
  | (BaseAgentSessionEvent & { eventType: 'agent_generate'; data: AgentGenerateData })
  | (BaseAgentSessionEvent & { eventType: 'agent_reasoning'; data: AgentReasoningData })
  | (BaseAgentSessionEvent & { eventType: 'transfer'; data: TransferData })
  | (BaseAgentSessionEvent & { eventType: 'delegation_sent'; data: DelegationSentData })
  | (BaseAgentSessionEvent & { eventType: 'delegation_returned'; data: DelegationReturnedData })
  | (BaseAgentSessionEvent & { eventType: 'artifact_saved'; data: ArtifactSavedData })
  | (BaseAgentSessionEvent & { eventType: 'tool_call'; data: ToolCallData })
  | (BaseAgentSessionEvent & { eventType: 'tool_result'; data: ToolResultData })
  | (BaseAgentSessionEvent & { eventType: 'error'; data: ErrorEventData });

export type EventData =
  | AgentGenerateData
  | AgentReasoningData
  | TransferData
  | DelegationSentData
  | DelegationReturnedData
  | ArtifactSavedData
  | ToolCallData
  | ToolResultData
  | ErrorEventData;

export type EventDataMap = {
  agent_generate: AgentGenerateData;
  agent_reasoning: AgentReasoningData;
  transfer: TransferData;
  delegation_sent: DelegationSentData;
  delegation_returned: DelegationReturnedData;
  artifact_saved: ArtifactSavedData;
  tool_call: ToolCallData;
  tool_result: ToolResultData;
  error: ErrorEventData;
};

type MakeAgentSessionEvent<T extends AgentSessionEventType> = BaseAgentSessionEvent & {
  eventType: T;
  data: EventDataMap[T];
};

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

export interface ArtifactSavedData {
  artifactId: string;
  taskId: string;
  toolCallId?: string;
  artifactType: string;
  pendingGeneration?: boolean;
  tenantId?: string;
  projectId?: string;
  contextId?: string;
  subAgentId?: string;
  subAgentName?: string;
  metadata?: Record<string, any>;
  summaryData?: Record<string, any>;
  data?: Record<string, any>;
  schemaValidation?: {
    summary: {
      hasExpectedFields: boolean;
      missingFields: string[];
      extraFields: string[];
      expectedFields: string[];
      actualFields: string[];
      hasRequiredFields: boolean;
      missingRequired: string[];
    };
    full: {
      hasExpectedFields: boolean;
      missingFields: string[];
      extraFields: string[];
      expectedFields: string[];
      actualFields: string[];
      hasRequiredFields: boolean;
      missingRequired: string[];
    };
    schemaFound: boolean;
  };
}

export interface ToolCallData {
  toolName: string;
  input: any;
  toolCallId: string;
  relationshipId?: string;
}

export interface ToolResultData {
  toolName: string;
  toolCallId: string;
  output: any;
  duration?: number;
  error?: string;
  relationshipId?: string;
}

export interface ErrorEventData {
  message: string;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
  context?: any;
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
export class AgentSession {
  private events: AgentSessionEvent[] = [];
  private statusUpdateState?: StatusUpdateState;
  private statusUpdateTimer?: ReturnType<typeof setInterval>;
  private previousSummaries: string[] = [];
  private isEnded: boolean = false;
  private isTextStreaming: boolean = false;
  private isGeneratingUpdate: boolean = false;
  private pendingArtifacts = new Set<string>(); // Track pending artifact processing
  private artifactProcessingErrors = new Map<string, number>(); // Track errors per artifact
  private readonly MAX_ARTIFACT_RETRIES = ARTIFACT_GENERATION_MAX_RETRIES;
  private readonly MAX_PENDING_ARTIFACTS = ARTIFACT_SESSION_MAX_PENDING; // Prevent unbounded growth
  private scheduledTimeouts?: Set<ReturnType<typeof setTimeout>>; // Track scheduled timeouts for cleanup
  private artifactCache = new Map<string, any>(); // Cache artifacts created in this session
  private artifactService?: any; // Session-scoped ArtifactService instance
  private artifactParser?: any; // Session-scoped ArtifactParser instance
  private isEmitOperations: boolean = false; // Whether to send data operations

  constructor(
    public readonly sessionId: string,
    public readonly messageId: string,
    public readonly ref: ResolvedRef,
    public readonly agentId?: string,
    public readonly tenantId?: string,
    public readonly projectId?: string,
    public readonly contextId?: string
  ) {
    logger.debug({ sessionId, messageId, agentId }, 'AgentSession created');

    if (tenantId && projectId) {
      toolSessionManager.createSessionWithId(
        sessionId,
        tenantId,
        projectId,
        contextId || 'default',
        `task_${contextId}-${messageId}` // Create a taskId based on context and message
      );

      this.artifactService = new ArtifactService(
        {
          tenantId,
          projectId,
          sessionId,
          contextId,
          taskId: `task_${contextId}-${messageId}`,
          streamRequestId: sessionId,
        },
        ref
      );

      this.artifactParser = new ArtifactParser(tenantId, ref, {
        projectId,
        sessionId: sessionId,
        contextId,
        taskId: `task_${contextId}-${messageId}`,
        streamRequestId: sessionId,
        artifactService: this.artifactService, // Pass the shared ArtifactService
      });
    }
    this.ref = ref;
  }

  /**
   * Enable emit operations to send data operations
   */
  enableEmitOperations(): void {
    this.isEmitOperations = true;
    logger.info(
      { sessionId: this.sessionId },
      '🔍 DEBUG: Emit operations enabled for AgentSession'
    );
  }

  /**
   * Send data operation to stream when emit operations is enabled
   */
  private async sendDataOperation(event: AgentSessionEvent): Promise<void> {
    try {
      const streamHelper = getStreamHelper(this.sessionId);
      if (streamHelper) {
        const formattedOperation = {
          type: event.eventType,
          label: this.generateEventLabel(event),
          details: {
            timestamp: event.timestamp,
            subAgentId: event.subAgentId,
            data: event.data,
          },
        };

        await streamHelper.writeOperation(formattedOperation);
      }
    } catch (error) {
      logger.error(
        {
          sessionId: this.sessionId,
          eventType: event.eventType,
          error: error instanceof Error ? error.message : error,
        },
        '❌ DEBUG: Failed to send data operation'
      );
    }
  }

  /**
   * Generate human-readable labels for events
   */
  private generateEventLabel(event: AgentSessionEvent): string {
    switch (event.eventType) {
      case 'agent_generate':
        return `Agent ${event.subAgentId} generating response`;
      case 'agent_reasoning':
        return `Agent ${event.subAgentId} reasoning through request`;
      case 'tool_call':
        return `Tool call: ${event.data.toolName || 'unknown'}`;
      case 'tool_result': {
        const status = event.data.error ? 'failed' : 'completed';
        return `Tool result: ${event.data.toolName || 'unknown'} (${status})`;
      }
      case 'error':
        return `Error: ${event.data.message}`;
      case 'transfer':
        return `Agent transfer: ${event.data.fromSubAgent} → ${event.data.targetSubAgent}`;
      case 'delegation_sent':
        return `Task delegated: ${event.data.fromSubAgent} → ${event.data.targetSubAgent}`;
      case 'delegation_returned':
        return `Task completed: ${event.data.targetSubAgent} → ${event.data.fromSubAgent}`;
      case 'artifact_saved':
        return `Artifact saved: ${event.data.artifactType || 'unknown type'}`;
      default:
        return `${(event as AgentSessionEvent).eventType} event`;
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
        numEvents: config.numEvents || STATUS_UPDATE_DEFAULT_NUM_EVENTS,
        timeInSeconds: config.timeInSeconds || STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS,
        ...config,
      },
    };

    if (this.statusUpdateState.config.timeInSeconds) {
      this.statusUpdateTimer = setInterval(async () => {
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
   * Generic type parameter T ensures eventType and data are correctly paired
   */
  recordEvent<T extends AgentSessionEventType>(
    eventType: T,
    subAgentId: string,
    data: EventDataMap[T]
  ): void {
    if (this.isEmitOperations) {
      const dataOpEvent: MakeAgentSessionEvent<T> = {
        timestamp: Date.now(),
        eventType,
        subAgentId,
        data,
      };
      this.sendDataOperation(dataOpEvent as AgentSessionEvent);
    }

    if (this.isEnded) {
      logger.debug(
        {
          sessionId: this.sessionId,
          eventType,
          subAgentId,
        },
        'Event received after session ended - ignoring'
      );
      return;
    }

    const event: MakeAgentSessionEvent<T> = {
      timestamp: Date.now(),
      eventType,
      subAgentId,
      data,
    };

    this.events.push(event as AgentSessionEvent);

    if (eventType === 'artifact_saved') {
      const artifactData = data as ArtifactSavedData;

      if (artifactData.pendingGeneration) {
        const artifactId = artifactData.artifactId;

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

        this.pendingArtifacts.add(artifactId);

        setImmediate(() => {
          const artifactDataWithAgent = { ...artifactData, subAgentId };
          this.processArtifact(artifactDataWithAgent)
            .then(() => {
              this.pendingArtifacts.delete(artifactId);
              this.artifactProcessingErrors.delete(artifactId);
            })
            .catch((error) => {
              const errorCount = (this.artifactProcessingErrors.get(artifactId) || 0) + 1;
              this.artifactProcessingErrors.set(artifactId, errorCount);

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
    }

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
  getEvents(): AgentSessionEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by type
   */
  getEventsByType(eventType: AgentSessionEventType): AgentSessionEvent[] {
    return this.events.filter((event) => event.eventType === eventType);
  }

  /**
   * Get events filtered by agent
   */
  getEventsByAgent(subAgentId: string): AgentSessionEvent[] {
    return this.events.filter((event) => event.subAgentId === subAgentId);
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
      {} as Record<AgentSessionEventType, number>
    );

    const agentCounts = this.events.reduce(
      (counts, event) => {
        counts[event.subAgentId] = (counts[event.subAgentId] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    return {
      sessionId: this.sessionId,
      messageId: this.messageId,
      agentId: this.agentId,
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

    // Clean up the ToolSession that this AgentSession created
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
   * Generate and send a status update using agent-level summarizer
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

    if (!this.agentId) {
      logger.warn({ sessionId: this.sessionId }, 'No agent ID - cannot generate update');
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

      // Keep only last N summaries to avoid context getting too large
      if (this.previousSummaries.length > ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES) {
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
    const timeoutId = setTimeout(async () => {
      try {
        if (this.isEnded || !this.statusUpdateState) {
          return;
        }

        if (!this.acquireUpdateLock()) {
          return; // Another update is in progress
        }

        try {
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
        this.releaseUpdateLock();
      }
    }, 0);

    if (!this.scheduledTimeouts) {
      this.scheduledTimeouts = new Set();
    }
    this.scheduledTimeouts.add(timeoutId);

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
    newEvents: AgentSessionEvent[],
    elapsedTime: number,
    statusComponents: StatusComponent[],
    summarizerModel?: ModelSettings,
    previousSummaries: string[] = []
  ): Promise<{ summaries: Array<{ type: string; data: Record<string, any> }> }> {
    return tracer.startActiveSpan(
      'agent_session.generate_structured_update',
      {
        attributes: {
          'agent_session.id': this.sessionId,
          'events.count': newEvents.length,
          'elapsed_time.seconds': Math.round(elapsedTime / 1000),
          'llm.model': summarizerModel?.model,
          'status_components.count': statusComponents.length,
          'previous_summaries.count': previousSummaries.length,
        },
      },
      async (span) => {
        try {
          const userVisibleActivities = this.extractUserVisibleActivities(newEvents);

          let conversationContext = '';
          if (this.tenantId && this.projectId) {
            try {
              const conversationHistory = await getFormattedConversationHistory({
                tenantId: this.tenantId,
                projectId: this.projectId,
                conversationId: this.contextId || 'default',
                options: {
                  limit: CONVERSATION_HISTORY_DEFAULT_LIMIT,
                  maxOutputTokens: CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
                  includeInternal: true,
                  messageTypes: ['chat', 'tool-result'],
                },
                filters: {},
                ref: this.ref,
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

          const selectionSchema = z.object(
            Object.fromEntries([
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
              ...statusComponents.map((component) => [
                component.type,
                this.getComponentSchema(component)
                  .optional()
                  .describe(component.description || component.type),
              ]),
            ])
          );

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
- NEVER describe transfers or transitions: Present everything as one seamless operation
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

          const summaries = [];
          for (const [componentId, data] of Object.entries(result)) {
            if (componentId === 'no_relevant_updates') {
              continue;
            }

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
          setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
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
    if (component.detailsSchema && 'properties' in component.detailsSchema) {
      return this.buildZodSchemaFromJson(component.detailsSchema);
    }

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

    properties.label = z
      .string()
      .describe(
        'A short 3-5 word phrase, that is a descriptive label for the update component. This Label must be EXTREMELY unique to represent the UNIQUE update we are providing. The SPECIFIC finding, result, or insight discovered (e.g., "Slack bot needs workspace admin role", "Found ingestion requires 3 steps", "Channel history limited to 10k messages"). State the ACTUAL information found, not that you searched. What did you LEARN or DISCOVER? What specific detail is now known? CRITICAL: Only use facts explicitly found in the activities - NEVER invent names, people, organizations, or details that are not present in the actual tool results.'
      );

    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      let zodType: z.ZodType<any>;

      if (value.enum && Array.isArray(value.enum)) {
        if (value.enum.length === 1) {
          zodType = z.literal(value.enum[0]);
        } else {
          const [first, ...rest] = value.enum;
          zodType = z.enum([first, ...rest] as [string, ...string[]]);
        }
      } else if (value.type === 'string') {
        zodType = z.string();
        if (value.minLength) zodType = (zodType as z.ZodString).min(value.minLength);
        if (value.maxLength) zodType = (zodType as z.ZodString).max(value.maxLength);
        if (value.format === 'email') zodType = (zodType as z.ZodString).email();
        if (value.format === 'url' || value.format === 'uri')
          zodType = (zodType as z.ZodString).url();
      } else if (value.type === 'number' || value.type === 'integer') {
        zodType = value.type === 'integer' ? z.number().int() : z.number();
        if (value.minimum !== undefined) zodType = (zodType as z.ZodNumber).min(value.minimum);
        if (value.maximum !== undefined) zodType = (zodType as z.ZodNumber).max(value.maximum);
      } else if (value.type === 'boolean') {
        zodType = z.boolean();
      } else if (value.type === 'array') {
        if (value.items) {
          if (value.items.enum && Array.isArray(value.items.enum)) {
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
        if (value.minItems) zodType = (zodType as z.ZodArray<any>).min(value.minItems);
        if (value.maxItems) zodType = (zodType as z.ZodArray<any>).max(value.maxItems);
      } else if (value.type === 'object') {
        zodType = z.record(z.string(), z.any());
      } else {
        zodType = z.any();
      }

      if (value.description) {
        zodType = zodType.describe(value.description);
      }

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
  private extractUserVisibleActivities(events: AgentSessionEvent[]): string[] {
    const activities: string[] = [];

    for (const event of events) {
      switch (event.eventType) {
        case 'tool_call': {
          activities.push(
            `🔧 **${event.data.toolName}** (called)\n` +
              `   📥 Input: ${JSON.stringify(event.data.input)}`
          );
          break;
        }

        case 'tool_result': {
          const resultStr = event.data.error
            ? `❌ Error: ${event.data.error}`
            : JSON.stringify(event.data.output);

          activities.push(
            `🔧 **${event.data.toolName}** ${event.data.duration ? `(${event.data.duration}ms)` : ''}\n` +
              `   📤 Output: ${resultStr}`
          );
          break;
        }

        case 'error': {
          activities.push(
            `❌ **Error**: ${event.data.message}\n` +
              `   🔍 Code: ${event.data.code || 'unknown'}\n` +
              `   📊 Severity: ${event.data.severity || 'error'}`
          );
          break;
        }

        case 'transfer':
        case 'delegation_sent':
        case 'delegation_returned':
        case 'artifact_saved':
          break;

        case 'agent_reasoning': {
          activities.push(
            `⚙️ **Analyzing request**\n   Details: ${JSON.stringify(event.data.parts, null, 2)}`
          );
          break;
        }

        case 'agent_generate': {
          activities.push(
            `⚙️ **Preparing response**\n   Details: ${JSON.stringify(event.data.parts, null, 2)}`
          );
          break;
        }

        default: {
          const safeEvent = event as AgentSessionEvent;
          activities.push(
            `📋 **${safeEvent.eventType}**: ${JSON.stringify(safeEvent.data, null, 2)}`
          );
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
      'agent_session.process_artifact',
      {
        attributes: {
          'agent_session.id': this.sessionId,
          'artifact.id': artifactData.artifactId,
          'artifact.type': artifactData.artifactType || 'unknown',
          'subAgent.id': artifactData.subAgentId || 'unknown',
          'subAgent.name': artifactData.subAgentName || 'unknown',
          'artifact.tool_call_id': artifactData.metadata?.toolCallId || 'unknown',
          'artifact.data': JSON.stringify(artifactData.data, null, 2),
          'tenant.id': artifactData.tenantId || 'unknown',
          'project.id': artifactData.projectId || 'unknown',
          'context.id': artifactData.contextId || 'unknown',
          has_tenant_id: !!artifactData.tenantId,
          has_project_id: !!artifactData.projectId,
          has_context_id: !!artifactData.contextId,
          has_metadata: !!artifactData.metadata,
          tool_call_id: artifactData.metadata?.toolCallId || 'missing',
          pending_generation: !!artifactData.pendingGeneration,
          // Schema validation attributes
          'schema_validation.schema_found': artifactData.schemaValidation?.schemaFound || false,
          'schema_validation.summary.has_expected_fields':
            artifactData.schemaValidation?.summary?.hasExpectedFields || true,
          'schema_validation.summary.missing_fields_count':
            artifactData.schemaValidation?.summary?.missingFields?.length || 0,
          'schema_validation.summary.extra_fields_count':
            artifactData.schemaValidation?.summary?.extraFields?.length || 0,
          'schema_validation.summary.expected_fields': JSON.stringify(
            artifactData.schemaValidation?.summary?.expectedFields || []
          ),
          'schema_validation.summary.actual_fields': JSON.stringify(
            artifactData.schemaValidation?.summary?.actualFields || []
          ),
          'schema_validation.summary.missing_fields': JSON.stringify(
            artifactData.schemaValidation?.summary?.missingFields || []
          ),
          'schema_validation.summary.extra_fields': JSON.stringify(
            artifactData.schemaValidation?.summary?.extraFields || []
          ),
          'schema_validation.summary.has_required_fields':
            artifactData.schemaValidation?.summary?.hasRequiredFields || true,
          'schema_validation.summary.missing_required_count':
            artifactData.schemaValidation?.summary?.missingRequired?.length || 0,
          'schema_validation.summary.missing_required': JSON.stringify(
            artifactData.schemaValidation?.summary?.missingRequired || []
          ),
          'schema_validation.full.has_expected_fields':
            artifactData.schemaValidation?.full?.hasExpectedFields || true,
          'schema_validation.full.missing_fields_count':
            artifactData.schemaValidation?.full?.missingFields?.length || 0,
          'schema_validation.full.extra_fields_count':
            artifactData.schemaValidation?.full?.extraFields?.length || 0,
          'schema_validation.full.expected_fields': JSON.stringify(
            artifactData.schemaValidation?.full?.expectedFields || []
          ),
          'schema_validation.full.actual_fields': JSON.stringify(
            artifactData.schemaValidation?.full?.actualFields || []
          ),
          'schema_validation.full.missing_fields': JSON.stringify(
            artifactData.schemaValidation?.full?.missingFields || []
          ),
          'schema_validation.full.extra_fields': JSON.stringify(
            artifactData.schemaValidation?.full?.extraFields || []
          ),
          'schema_validation.full.has_required_fields':
            artifactData.schemaValidation?.full?.hasRequiredFields || true,
          'schema_validation.full.missing_required_count':
            artifactData.schemaValidation?.full?.missingRequired?.length || 0,
          'schema_validation.full.missing_required': JSON.stringify(
            artifactData.schemaValidation?.full?.missingRequired || []
          ),
        },
      },
      async (span) => {
        try {
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

          const conversationHistory = await getFormattedConversationHistory({
            tenantId: artifactData.tenantId,
            projectId: artifactData.projectId,
            conversationId: artifactData.contextId,
            options: {
              limit: 10, // Only need recent context
              includeInternal: false, // Focus on user messages
              messageTypes: ['chat'],
            },
            ref: this.ref,
          });

          const toolCallEvent = this.events.find(
            (event) =>
              event.eventType === 'tool_result' &&
              event.data &&
              'toolCallId' in event.data &&
              event.data.toolCallId === artifactData.metadata?.toolCallId
          ) as AgentSessionEvent | undefined;

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
Data: ${JSON.stringify(artifactData.data || artifactData.summaryData, null, 2)}

Make it specific and relevant.`;

          let modelToUse = this.statusUpdateState?.summarizerModel;
          if (!modelToUse?.model?.trim()) {
            if (!this.statusUpdateState?.baseModel?.model?.trim()) {
              if (artifactData.subAgentId && artifactData.tenantId && artifactData.projectId) {
                try {
                  const tenantId = artifactData.tenantId;
                  const projectId = artifactData.projectId;
                  const subAgentId = artifactData.subAgentId;
                  const agentData = await executeInBranch(
                    {
                      dbClient: dbClient,
                      ref: this.ref,
                    },
                    async (db) => {
                      return await getSubAgentById(db)({
                        scopes: {
                          tenantId,
                          projectId,
                          agentId: this.agentId || '',
                        },
                        subAgentId,
                      });
                    }
                  );

                  if (agentData && 'models' in agentData && agentData.models?.base?.model) {
                    modelToUse = agentData.models.base;
                    logger.info(
                      {
                        sessionId: this.sessionId,
                        artifactId: artifactData.artifactId,
                        subAgentId: artifactData.subAgentId,
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
                      subAgentId: artifactData.subAgentId,
                      error: error instanceof Error ? error.message : 'Unknown error',
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
                modelToUse = undefined;
              }
            } else {
              modelToUse = this.statusUpdateState.baseModel;
            }
          }

          let result: { name: string; description: string };
          if (!modelToUse) {
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

            const { object } = await tracer.startActiveSpan(
              'agent_session.generate_artifact_metadata',
              {
                attributes: {
                  'llm.model': this.statusUpdateState?.summarizerModel?.model,
                  'llm.operation': 'generate_object',
                  'artifact.id': artifactData.artifactId,
                  'artifact.type': artifactData.artifactType,
                  'artifact.summary': JSON.stringify(artifactData.summaryData, null, 2),
                  'artifact.full': JSON.stringify(
                    artifactData.data || artifactData.summaryData,
                    null,
                    2
                  ),
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
                      'artifact.summary': JSON.stringify(artifactData.summaryData, null, 2),
                      'artifact.full': JSON.stringify(
                        artifactData.data || artifactData.summaryData,
                        null,
                        2
                      ),
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

                    if (attempt < maxRetries) {
                      const backoffMs = Math.min(
                        ARTIFACT_GENERATION_BACKOFF_INITIAL_MS * 2 ** (attempt - 1),
                        ARTIFACT_GENERATION_BACKOFF_MAX_MS
                      );
                      await new Promise((resolve) => setTimeout(resolve, backoffMs));
                    }
                  }
                }

                setSpanWithError(
                  generationSpan,
                  lastError instanceof Error ? lastError : new Error(String(lastError))
                );
                throw new Error(
                  `Artifact name/description generation failed after ${maxRetries} attempts: ${lastError?.message}`
                );
              }
            );
            result = object;
          }

          try {
            await this.artifactService.saveArtifact({
              artifactId: artifactData.artifactId,
              name: result.name,
              description: result.description,
              type: artifactData.artifactType || 'source',
              data: artifactData.data || {},
              metadata: artifactData.metadata || {},
              toolCallId: artifactData.toolCallId,
            });

            mainSaveSucceeded = true;

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
          }

          if (!mainSaveSucceeded) {
            try {
              if (artifactData.tenantId && artifactData.projectId) {
                const artifactService = new ArtifactService(
                  {
                    tenantId: artifactData.tenantId,
                    projectId: artifactData.projectId,
                    contextId: artifactData.contextId || 'unknown',
                    taskId: artifactData.taskId,
                    sessionId: this.sessionId,
                  },
                  this.ref
                );

                await artifactService.saveArtifact({
                  artifactId: artifactData.artifactId,
                  name: `Artifact ${artifactData.artifactId.substring(0, 8)}`,
                  description: `${artifactData.artifactType || 'Data'} from ${artifactData.metadata?.toolName || 'tool results'}`,
                  type: artifactData.artifactType || 'source',
                  data: artifactData.data || {},
                  metadata: artifactData.metadata || {},
                  toolCallId: artifactData.toolCallId,
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
              const isDuplicateError =
                fallbackError instanceof Error &&
                (fallbackError.message?.includes('UNIQUE') ||
                  fallbackError.message?.includes('duplicate'));

              if (isDuplicateError) {
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
          setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
          logger.error(
            {
              sessionId: this.sessionId,
              artifactId: artifactData.artifactId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to process artifact (name/description generation failed)'
          );
        } finally {
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

  /**
   * Update artifact components in the shared ArtifactService
   */
  updateArtifactComponents(artifactComponents: any[]): void {
    if (this.artifactService) {
      this.artifactService.updateArtifactComponents(artifactComponents);
    }
  }
}

/**
 * Manages AgentSession instances for message-level tracking
 */
export class AgentSessionManager {
  private sessions = new Map<string, AgentSession>();

  /**
   * Create a new session for a message
   */
  createSession(
    messageId: string,
    ref: ResolvedRef,
    agentId?: string,
    tenantId?: string,
    projectId?: string,
    contextId?: string
  ): string {
    const sessionId = messageId; // Use messageId directly as sessionId
    const session = new AgentSession(
      sessionId,
      messageId,
      ref,
      agentId,
      tenantId,
      projectId,
      contextId
    );
    this.sessions.set(sessionId, session);

    logger.info(
      { sessionId, messageId, agentId, tenantId, projectId, contextId },
      'AgentSession created'
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
   * Enable emit operations for a session to send data operations
   */
  enableEmitOperations(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.enableEmitOperations();
    } else {
      logger.error(
        {
          sessionId,
          availableSessions: Array.from(this.sessions.keys()),
        },
        'Session not found for emit operations enablement'
      );
    }
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Record an event in a session
   * Generic type parameter T ensures eventType and data are correctly paired
   */
  recordEvent<T extends AgentSessionEventType>(
    sessionId: string,
    eventType: T,
    subAgentId: string,
    data: EventDataMap[T]
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Attempted to record event in non-existent session');
      return;
    }

    session.recordEvent(eventType, subAgentId, data);
  }

  /**
   * End a session and return the final event data
   */
  endSession(sessionId: string): AgentSessionEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Attempted to end non-existent session');
      return [];
    }

    const events = session.getEvents();
    const summary = session.getSummary();

    logger.info({ sessionId, summary }, 'AgentSession ended');

    session.cleanup();

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

  /**
   * Update artifact components for a session
   */
  updateArtifactComponents(sessionId: string, artifactComponents: any[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.updateArtifactComponents(artifactComponents);
    }
  }
}

export const agentSessionManager = new AgentSessionManager();

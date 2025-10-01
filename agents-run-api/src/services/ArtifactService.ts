import {
  type ArtifactComponentApiInsert,
  getLedgerArtifacts,
  getTask,
  listTaskIdsByContextId,
  upsertLedgerArtifact,
} from '@inkeep/agents-core';
import jmespath from 'jmespath';
import { nanoid } from 'nanoid';
import { toolSessionManager } from '../agents/ToolSessionManager';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { graphSessionManager } from './GraphSession';

const logger = getLogger('ArtifactService');

// Types moved from ArtifactParser
export interface ArtifactData {
  artifactId: string;
  toolCallId: string;
  name: string;
  description: string;
  type?: string;
  artifactSummary: any;
}

export interface ArtifactCreateRequest {
  artifactId: string;
  toolCallId: string;
  type: string;
  baseSelector: string;
  summaryProps?: Record<string, string>;
  fullProps?: Record<string, string>;
}

export interface ArtifactServiceContext {
  tenantId: string;
  sessionId?: string;
  taskId?: string;
  projectId?: string;
  contextId?: string;
  artifactComponents?: ArtifactComponentApiInsert[];
  streamRequestId?: string;
  agentId?: string;
}

/**
 * Service class responsible for artifact business logic operations
 * Handles database persistence, tool result extraction, and artifact management
 * Separated from parsing concerns for better architecture
 */
export class ArtifactService {
  private createdArtifacts: Map<string, any> = new Map();
  private static selectorCache = new Map<string, string>();

  constructor(private context: ArtifactServiceContext) {}

  /**
   * Clear static caches to prevent memory leaks between sessions
   */
  static clearCaches(): void {
    ArtifactService.selectorCache.clear();
  }

  /**
   * Get all artifacts for a context from database
   */
  async getContextArtifacts(contextId: string): Promise<Map<string, any>> {
    const artifacts = new Map<string, any>();

    try {
      const taskIds = await listTaskIdsByContextId(dbClient)({
        contextId: contextId,
      });

      for (const taskId of taskIds) {
        const task = await getTask(dbClient)({
          id: taskId,
        });
        if (!task) {
          logger.warn({ taskId }, 'Task not found when fetching artifacts');
          continue;
        }

        const taskArtifacts = await getLedgerArtifacts(dbClient)({
          scopes: { tenantId: this.context.tenantId, projectId: task.projectId },
          taskId,
        });

        for (const artifact of taskArtifacts) {
          const toolCallId = artifact.metadata?.toolCallId || '';
          if (toolCallId) {
            const key = `${artifact.artifactId}:${toolCallId}`;
            artifacts.set(key, artifact);
          }
          const taskKey = `${artifact.artifactId}:${artifact.taskId}`;
          artifacts.set(taskKey, artifact);
        }
      }
    } catch (error) {
      logger.error({ error, contextId }, 'Error loading context artifacts');
    }

    return artifacts;
  }

  /**
   * Create artifact from tool result and request data
   */
  async createArtifact(request: ArtifactCreateRequest, agentId?: string): Promise<ArtifactData | null> {
    
    if (!this.context.sessionId) {
      logger.warn({ request }, 'No session ID available for artifact creation');
      return null;
    }

    // Get the tool result from the session
    const toolResult = toolSessionManager.getToolResult(this.context.sessionId, request.toolCallId);
    if (!toolResult) {
      logger.warn(
        { request, sessionId: this.context.sessionId },
        'Tool result not found for artifact'
      );
      return null;
    }

    try {
      // Clean tool result data
      const toolResultData =
        toolResult && typeof toolResult === 'object' && !Array.isArray(toolResult)
          ? Object.fromEntries(
              Object.entries(toolResult).filter(([key]) => key !== '_structureHints')
            )
          : toolResult;

      // Extract data using base selector
      const sanitizedBaseSelector = this.sanitizeJMESPathSelector(request.baseSelector);
      let selectedData = jmespath.search(toolResultData, sanitizedBaseSelector);

      // Handle array results
      if (Array.isArray(selectedData)) {
        selectedData = selectedData.length > 0 ? selectedData[0] : {};
      }

      if (!selectedData) {
        logger.warn(
          {
            request,
            baseSelector: request.baseSelector,
          },
          'Base selector returned no data - using empty object as fallback'
        );
        selectedData = {};
      }

      // Extract summary and full data

      const summaryData = this.extractProps(selectedData, request.summaryProps || {});
      let fullData = this.extractProps(selectedData, request.fullProps || {});

      // Fallback: if fullData is empty, use the entire selectedData from base selector
      const isFullDataEmpty =
        !fullData ||
        Object.keys(fullData).length === 0 ||
        Object.values(fullData).every(
          (val) =>
            val === null ||
            val === undefined ||
            val === '' ||
            (Array.isArray(val) && val.length === 0) ||
            (typeof val === 'object' && Object.keys(val).length === 0)
        );

      if (isFullDataEmpty) {
        fullData = { baseSelector: selectedData };
      }

      // Clean the extracted data to remove over-escaping
      const cleanedSummaryData = this.cleanEscapedContent(summaryData);
      const cleanedFullData = this.cleanEscapedContent(fullData);

      // Find matching artifact component for validation
      const component = this.context.artifactComponents?.find((ac) => ac.name === request.type);

      // Create artifact data using cleaned data
      const artifactData: ArtifactData = {
        artifactId: request.artifactId,
        toolCallId: request.toolCallId,
        name: 'Processing...',
        description: 'Name and description being generated...',
        type: request.type,
        artifactSummary: component?.summaryProps
          ? this.filterBySchema(cleanedSummaryData, component.summaryProps)
          : cleanedSummaryData,
      };

      // Persist artifact to database using cleaned data
      await this.persistArtifact(request, cleanedSummaryData, cleanedFullData, agentId);

      // Cache artifact for immediate access using cleaned data
      await this.cacheArtifact(
        request.artifactId,
        request.toolCallId,
        artifactData,
        cleanedFullData
      );

      return artifactData;
    } catch (error) {
      logger.error({ error, request }, 'Failed to create artifact');

      // Throw a more descriptive error for better error propagation
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Artifact creation failed for ${request.artifactId}: ${errorMessage}`);
    }
  }

  /**
   * Get artifact data by ID and tool call ID
   */
  async getArtifactData(
    artifactId: string,
    toolCallId: string,
    artifactMap?: Map<string, any>
  ): Promise<ArtifactData | null> {
    const key = `${artifactId}:${toolCallId}`;

    // Check graph session cache
    if (this.context.streamRequestId) {
      const cachedArtifact = await graphSessionManager.getArtifactCache(
        this.context.streamRequestId,
        key
      );
      if (cachedArtifact) {
        return this.formatArtifactData(cachedArtifact, artifactId, toolCallId);
      }
    }

    // Check local cache
    if (this.createdArtifacts.has(key)) {
      const cached = this.createdArtifacts.get(key)!;
      return this.formatArtifactData(cached, artifactId, toolCallId);
    }

    // Check provided artifact map
    if (artifactMap?.has(key)) {
      const artifact = artifactMap.get(key);
      return this.formatArtifactData(artifact, artifactId, toolCallId);
    }

    // Fetch from database
    try {
      if (!this.context.projectId || !this.context.taskId) {
        logger.warn(
          { artifactId, toolCallId },
          'No projectId or taskId available for artifact lookup'
        );
        return null;
      }

      const artifacts = await getLedgerArtifacts(dbClient)({
        scopes: { tenantId: this.context.tenantId, projectId: this.context.projectId },
        artifactId,
        taskId: this.context.taskId,
      });

      if (artifacts.length > 0) {
        return this.formatArtifactData(artifacts[0], artifactId, toolCallId);
      }
    } catch (error) {
      logger.warn(
        { artifactId, toolCallId, taskId: this.context.taskId, error },
        'Failed to fetch artifact'
      );
    }

    return null;
  }

  /**
   * Format raw artifact to standardized data format
   */
  private formatArtifactData(artifact: any, artifactId: string, toolCallId: string): ArtifactData {
    return {
      artifactId,
      toolCallId,
      name: artifact.name || 'Processing...',
      description: artifact.description || 'Name and description being generated...',
      type: artifact.metadata?.artifactType || artifact.artifactType,
      artifactSummary: artifact.parts?.[0]?.data?.summary || {},
    };
  }

  /**
   * Persist artifact to database via graph session
   */
  private async persistArtifact(
    request: ArtifactCreateRequest,
    summaryData: Record<string, any>,
    fullData: Record<string, any>,
    agentId?: string
  ): Promise<void> {
    // Use passed agentId or fall back to context agentId
    const effectiveAgentId = agentId || this.context.agentId;
    
    
    if (this.context.streamRequestId && effectiveAgentId && this.context.taskId) {
      await graphSessionManager.recordEvent(
        this.context.streamRequestId,
        'artifact_saved',
        effectiveAgentId,
        {
          artifactId: request.artifactId,
          taskId: this.context.taskId,
          toolCallId: request.toolCallId,
          artifactType: request.type,
          summaryProps: summaryData,
          fullProps: fullData,
          agentId: effectiveAgentId,
          metadata: {
            toolCallId: request.toolCallId,
            baseSelector: request.baseSelector,
            summaryProps: request.summaryProps,
            fullProps: request.fullProps,
            sessionId: this.context.sessionId,
            artifactType: request.type,
          },
          tenantId: this.context.tenantId,
          projectId: this.context.projectId,
          contextId: this.context.contextId,
          pendingGeneration: true,
        }
      );
    } else {
      logger.warn({
        artifactId: request.artifactId,
        hasStreamRequestId: !!this.context.streamRequestId,
        hasAgentId: !!effectiveAgentId,
        hasTaskId: !!this.context.taskId,
        passedAgentId: agentId,
        contextAgentId: this.context.agentId,
      }, 'Skipping artifact_saved event - missing required context');
    }
  }

  /**
   * Cache artifact for immediate access
   */
  private async cacheArtifact(
    artifactId: string,
    toolCallId: string,
    artifactData: ArtifactData,
    fullData: Record<string, any>
  ): Promise<void> {
    const cacheKey = `${artifactId}:${toolCallId}`;
    const artifactForCache = {
      ...artifactData,
      parts: [{ data: { summary: artifactData.artifactSummary, full: fullData } }],
      metadata: { artifactType: artifactData.type, toolCallId },
      taskId: this.context.taskId,
    };

    // Store in local cache
    this.createdArtifacts.set(cacheKey, artifactForCache);

    // Store in graph session cache
    if (this.context.streamRequestId) {
      await graphSessionManager.setArtifactCache(
        this.context.streamRequestId,
        cacheKey,
        artifactForCache
      );
    }
  }

  /**
   * Sanitize JMESPath selector to fix common syntax issues (with caching)
   */
  private sanitizeJMESPathSelector(selector: string): string {
    // Check cache first
    const cached = ArtifactService.selectorCache.get(selector);
    if (cached !== undefined) {
      return cached;
    }

    // Perform sanitization
    let sanitized = selector.replace(/=="([^"]*)"/g, "=='$1'");

    // Fix contains syntax with @ references - match patterns like [?field ~ contains(@, "value")]
    sanitized = sanitized.replace(
      /\[\?(\w+)\s*~\s*contains\(@,\s*"([^"]*)"\)\]/g,
      '[?contains($1, `$2`)]'
    );

    sanitized = sanitized.replace(
      /\[\?(\w+)\s*~\s*contains\(@,\s*'([^']*)'\)\]/g,
      '[?contains($1, `$2`)]'
    );

    sanitized = sanitized.replace(/\s*~\s*/g, ' ');

    // Cache the result (limit cache size to prevent memory leaks)
    if (ArtifactService.selectorCache.size < 1000) {
      ArtifactService.selectorCache.set(selector, sanitized);
    }

    return sanitized;
  }

  /**
   * Save an already-created artifact directly to the database
   * Used by GraphSession to save artifacts after name/description generation
   */
  async saveArtifact(artifact: {
    artifactId: string;
    name: string;
    description: string;
    type: string;
    summaryProps: Record<string, any>;
    fullProps: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<void> {
    // upsertLedgerArtifact is now imported at the top

    // Use the data as-is - database layer now handles sanitization properly

    const artifactToSave = {
      artifactId: artifact.artifactId,
      name: artifact.name,
      description: artifact.description,
      type: artifact.type,
      taskId: this.context.taskId,
      parts: [
        {
          kind: 'data' as const,
          data: {
            summary: artifact.summaryProps,
            full: artifact.fullProps,
          },
        },
      ],
      metadata: artifact.metadata || {},
    };

    // Note: Database layer now handles all data sanitization and validation

    // Use atomic upsert to prevent race conditions
    const result = await upsertLedgerArtifact(dbClient)({
      scopes: {
        tenantId: this.context.tenantId,
        projectId: this.context.projectId!,
      },
      contextId: this.context.contextId!,
      taskId: this.context.taskId!,
      artifact: artifactToSave,
    });

    if (!result.created && result.existing) {
      // Artifact already exists - this is fine, just log it
      logger.debug(
        {
          artifactId: artifact.artifactId,
          taskId: this.context.taskId,
        },
        'Artifact already exists, skipping duplicate creation'
      );
    }
  }

  /**
   * Clean up over-escaped strings that have been through multiple JSON serialization cycles
   */
  public cleanEscapedContent(value: any): any {
    if (typeof value === 'string') {
      // Clean problematic characters and over-escaped content
      let cleaned = value;

      // First, remove control characters that can cause database issues
      cleaned = cleaned
        .replace(/\u0000/g, '') // Remove null bytes
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // Remove control chars

      // Handle escaped quotes and apostrophes that cause JSON serialization issues
      // These patterns get double-escaped during JSON serialization for SQLite
      cleaned = cleaned
        .replace(/\\"([^"]+)\\"/g, '"$1"') // \"text\" -> "text"
        .replace(/\\'/g, "'") // \' -> '
        .replace(/\\`/g, '`') // \` -> `
        .replace(/\\\\/g, '\\'); // \\\\ -> \\

      // Aggressively fix over-escaped content
      // Handle the specific pattern we're seeing: \\\\\\n (4 backslashes + n)
      const maxIterations = 10;
      let iteration = 0;
      let previousLength;

      do {
        previousLength = cleaned.length;
        // Replace patterns in order from most escaped to least
        cleaned = cleaned
          .replace(/\\\\\\\\n/g, '\n') // 4 backslashes + n -> newline
          .replace(/\\\\\\\\/g, '\\') // 4 backslashes -> 1 backslash
          .replace(/\\\\n/g, '\n') // 2 backslashes + n -> newline
          .replace(/\\\\/g, '\\') // 2 backslashes -> 1 backslash
          .replace(/\\n/g, '\n') // 1 backslash + n -> newline
          .replace(/\\"/g, '"') // Escaped quotes
          .replace(/\\'/g, "'"); // Escaped single quotes
        iteration++;
      } while (cleaned.length !== previousLength && iteration < maxIterations);

      // Final pass to ensure no remaining double backslashes
      cleaned = cleaned.replace(/\\\\/g, '\\');

      return cleaned;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.cleanEscapedContent(item));
    }

    if (value && typeof value === 'object') {
      const cleaned: any = {};
      for (const [key, val] of Object.entries(value)) {
        cleaned[key] = this.cleanEscapedContent(val);
      }
      return cleaned;
    }

    return value;
  }

  /**
   * Extract properties from data using prop selectors
   */
  private extractProps(item: any, propSelectors: Record<string, string>): Record<string, any> {
    const extracted: Record<string, any> = {};

    for (const [propName, selector] of Object.entries(propSelectors)) {
      try {
        const sanitizedSelector = this.sanitizeJMESPathSelector(selector);

        const rawValue = sanitizedSelector
          ? jmespath.search(item, sanitizedSelector)
          : item[propName];

        if (rawValue !== null && rawValue !== undefined) {
          // Clean up over-escaped content before storing
          extracted[propName] = this.cleanEscapedContent(rawValue);
        }
      } catch (error) {
        logger.warn(
          { propName, selector, error: error instanceof Error ? error.message : 'Unknown error' },
          'Failed to extract property'
        );
        const fallbackValue = item[propName];
        if (fallbackValue !== null && fallbackValue !== undefined) {
          extracted[propName] = this.cleanEscapedContent(fallbackValue);
        }
      }
    }

    return extracted;
  }

  /**
   * Filter extracted props based on schema
   */
  private filterBySchema(props: Record<string, any>, schema: any): Record<string, any> {
    if (!schema?.properties) return props;

    const filtered: Record<string, any> = {};
    for (const key of Object.keys(schema.properties)) {
      if (key in props) {
        filtered[key] = props[key];
      }
    }

    return filtered;
  }
}

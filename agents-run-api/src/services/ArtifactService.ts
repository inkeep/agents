import {
  type ArtifactComponentApiInsert,
  getLedgerArtifacts,
  getTask,
  listTaskIdsByContextId,
  upsertLedgerArtifact,
} from '@inkeep/agents-core';
import jmespath from 'jmespath';
import { toolSessionManager } from '../agents/ToolSessionManager';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import {
  type ExtendedJsonSchema,
  extractFullFields,
  extractPreviewFields,
} from '../utils/schema-validation';
import { agentSessionManager } from './AgentSession';

const logger = getLogger('ArtifactService');

export interface ArtifactSummaryData {
  artifactId: string;
  toolCallId: string;
  name: string;
  description: string;
  type?: string;
  data: any;
}

export interface ArtifactFullData {
  artifactId: string;
  toolCallId: string;
  name: string;
  description: string;
  type?: string;
  data: any;
}

export interface ArtifactCreateRequest {
  artifactId: string;
  toolCallId: string;
  type: string;
  baseSelector: string;
  detailsSelector?: Record<string, string>;
}

export interface ArtifactServiceContext {
  tenantId: string;
  sessionId?: string;
  taskId?: string;
  projectId?: string;
  contextId?: string;
  artifactComponents?: ArtifactComponentApiInsert[];
  streamRequestId?: string;
  subAgentId?: string;
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
   * Update artifact components in the context
   */
  updateArtifactComponents(artifactComponents: ArtifactComponentApiInsert[]): void {
    this.context.artifactComponents = artifactComponents;
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
  async createArtifact(
    request: ArtifactCreateRequest,
    subAgentId?: string
  ): Promise<ArtifactSummaryData | null> {
    if (!this.context.sessionId) {
      logger.warn({ request }, 'No session ID available for artifact creation');
      return null;
    }

    const toolResult = toolSessionManager.getToolResult(this.context.sessionId, request.toolCallId);
    if (!toolResult) {
      logger.warn(
        { request, sessionId: this.context.sessionId },
        'Tool result not found for artifact'
      );
      return null;
    }

    try {
      const toolResultData =
        toolResult && typeof toolResult === 'object' && !Array.isArray(toolResult)
          ? Object.fromEntries(
              Object.entries(toolResult).filter(([key]) => key !== '_structureHints')
            )
          : toolResult;

      const sanitizedBaseSelector = this.sanitizeJMESPathSelector(request.baseSelector);
      let selectedData = jmespath.search(toolResultData, sanitizedBaseSelector);

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

      const component = this.context.artifactComponents?.find((ac) => ac.name === request.type);

      let summaryData: Record<string, any> = {};
      let fullData: Record<string, any> = {};

      if (component?.props) {
        const previewSchema = extractPreviewFields(component.props as ExtendedJsonSchema);
        const fullSchema = extractFullFields(component.props as ExtendedJsonSchema);

        summaryData = this.extractPropsFromSchema(
          selectedData,
          previewSchema,
          request.detailsSelector || {}
        );
        fullData = this.extractPropsFromSchema(
          selectedData,
          fullSchema,
          request.detailsSelector || {}
        );
      } else {
        summaryData = selectedData;
        fullData = selectedData;
      }

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

      const cleanedSummaryData = this.cleanEscapedContent(summaryData);
      const cleanedFullData = this.cleanEscapedContent(fullData);

      const artifactData: ArtifactSummaryData = {
        artifactId: request.artifactId,
        toolCallId: request.toolCallId,
        name: 'Processing...',
        description: 'Name and description being generated...',
        type: request.type,
        data: cleanedSummaryData,
      };

      await this.persistArtifact(request, cleanedSummaryData, cleanedFullData, subAgentId);

      await this.cacheArtifact(
        request.artifactId,
        request.toolCallId,
        artifactData,
        cleanedFullData
      );

      return artifactData;
    } catch (error) {
      logger.error({ error, request }, 'Failed to create artifact');

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Artifact creation failed for ${request.artifactId}: ${errorMessage}`);
    }
  }

  /**
   * Get artifact summary data by ID and tool call ID
   */
  async getArtifactSummary(
    artifactId: string,
    toolCallId: string,
    artifactMap?: Map<string, any>
  ): Promise<ArtifactSummaryData | null> {
    const key = `${artifactId}:${toolCallId}`;

    if (this.context.streamRequestId) {
      const cachedArtifact = await agentSessionManager.getArtifactCache(
        this.context.streamRequestId,
        key
      );
      if (cachedArtifact) {
        return this.formatArtifactSummaryData(cachedArtifact, artifactId, toolCallId);
      }
    }

    if (this.createdArtifacts.has(key)) {
      const cached = this.createdArtifacts.get(key)!;
      return this.formatArtifactSummaryData(cached, artifactId, toolCallId);
    }

    if (artifactMap?.has(key)) {
      const artifact = artifactMap.get(key);
      return this.formatArtifactSummaryData(artifact, artifactId, toolCallId);
    }

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
        return this.formatArtifactSummaryData(artifacts[0], artifactId, toolCallId);
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
   * Get artifact full data by ID and tool call ID
   */
  async getArtifactFull(
    artifactId: string,
    toolCallId: string,
    artifactMap?: Map<string, any>
  ): Promise<ArtifactFullData | null> {
    const key = `${artifactId}:${toolCallId}`;

    if (this.context.streamRequestId) {
      const cachedArtifact = await agentSessionManager.getArtifactCache(
        this.context.streamRequestId,
        key
      );
      if (cachedArtifact) {
        return this.formatArtifactFullData(cachedArtifact, artifactId, toolCallId);
      }
    }

    if (this.createdArtifacts.has(key)) {
      const cached = this.createdArtifacts.get(key)!;
      return this.formatArtifactFullData(cached, artifactId, toolCallId);
    }

    if (artifactMap?.has(key)) {
      const artifact = artifactMap.get(key);
      return this.formatArtifactFullData(artifact, artifactId, toolCallId);
    }

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
        return this.formatArtifactFullData(artifacts[0], artifactId, toolCallId);
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
   * Format raw artifact to standardized summary data format
   */
  private formatArtifactSummaryData(
    artifact: any,
    artifactId: string,
    toolCallId: string
  ): ArtifactSummaryData {
    return {
      artifactId,
      toolCallId,
      name: artifact.name || 'Processing...',
      description: artifact.description || 'Name and description being generated...',
      type: artifact.metadata?.artifactType || artifact.artifactType,
      data: artifact.parts?.[0]?.data?.summary || {},
    };
  }

  /**
   * Format raw artifact to standardized full data format
   */
  private formatArtifactFullData(
    artifact: any,
    artifactId: string,
    toolCallId: string
  ): ArtifactFullData {
    return {
      artifactId,
      toolCallId,
      name: artifact.name || 'Processing...',
      description: artifact.description || 'Name and description being generated...',
      type: artifact.metadata?.artifactType || artifact.artifactType,
      data: artifact.parts?.[0]?.data?.full || {},
    };
  }

  /**
   * Persist artifact to database vian agent session
   */
  private async persistArtifact(
    request: ArtifactCreateRequest,
    summaryData: Record<string, any>,
    fullData: Record<string, any>,
    subAgentId?: string
  ): Promise<void> {
    const effectiveAgentId = subAgentId || this.context.subAgentId;

    if (this.context.streamRequestId && effectiveAgentId && this.context.taskId) {
      await agentSessionManager.recordEvent(
        this.context.streamRequestId,
        'artifact_saved',
        effectiveAgentId,
        {
          artifactId: request.artifactId,
          taskId: this.context.taskId,
          toolCallId: request.toolCallId,
          artifactType: request.type,
          summaryData: summaryData,
          data: fullData,
          subAgentId: effectiveAgentId,
          metadata: {
            toolCallId: request.toolCallId,
            baseSelector: request.baseSelector,
            detailsSelector: request.detailsSelector,
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
      logger.warn(
        {
          artifactId: request.artifactId,
          hasStreamRequestId: !!this.context.streamRequestId,
          hasAgentId: !!effectiveAgentId,
          hasTaskId: !!this.context.taskId,
          passedAgentId: subAgentId,
          contextAgentId: this.context.subAgentId,
        },
        'Skipping artifact_saved event - missing required context'
      );
    }
  }

  /**
   * Cache artifact for immediate access
   */
  private async cacheArtifact(
    artifactId: string,
    toolCallId: string,
    artifactData: ArtifactSummaryData,
    fullData: Record<string, any>
  ): Promise<void> {
    const cacheKey = `${artifactId}:${toolCallId}`;
    const artifactForCache = {
      ...artifactData,
      parts: [{ data: { summary: artifactData.data, data: fullData } }],
      metadata: { artifactType: artifactData.type, toolCallId },
      taskId: this.context.taskId,
    };

    this.createdArtifacts.set(cacheKey, artifactForCache);

    if (this.context.streamRequestId) {
      await agentSessionManager.setArtifactCache(
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
    const cached = ArtifactService.selectorCache.get(selector);
    if (cached !== undefined) {
      return cached;
    }

    let sanitized = selector.replace(/=="([^"]*)"/g, "=='$1'");

    sanitized = sanitized.replace(
      /\[\?(\w+)\s*~\s*contains\(@,\s*"([^"]*)"\)\]/g,
      '[?contains($1, `$2`)]'
    );

    sanitized = sanitized.replace(
      /\[\?(\w+)\s*~\s*contains\(@,\s*'([^']*)'\)\]/g,
      '[?contains($1, `$2`)]'
    );

    sanitized = sanitized.replace(/\s*~\s*/g, ' ');

    if (ArtifactService.selectorCache.size < 1000) {
      ArtifactService.selectorCache.set(selector, sanitized);
    }

    return sanitized;
  }

  /**
   * Save an already-created artifact directly to the database
   * Used by AgentSession to save artifacts after name/description generation
   */
  async saveArtifact(artifact: {
    artifactId: string;
    name: string;
    description: string;
    type: string;
    data: Record<string, any>;
    metadata?: Record<string, any>;
    toolCallId?: string;
  }): Promise<void> {
    let summaryData = artifact.data;
    let fullData = artifact.data;

    if (this.context.artifactComponents) {
      const artifactComponent = this.context.artifactComponents.find(
        (ac) => ac.name === artifact.type
      );
      if (artifactComponent?.props) {
        try {
          const schema = artifactComponent.props as ExtendedJsonSchema;
          const previewSchema = extractPreviewFields(schema);
          const fullSchema = extractFullFields(schema);

          summaryData = this.filterBySchema(artifact.data, previewSchema);
          fullData = this.filterBySchema(artifact.data, fullSchema);
        } catch (error) {
          logger.warn(
            {
              artifactType: artifact.type,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to extract preview/full fields from schema, using full data for both'
          );
        }
      }
    }

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
            summary: summaryData,
            full: fullData,
          },
        },
      ],
      metadata: artifact.metadata || {},
    };


    const result = await upsertLedgerArtifact(dbClient)({
      scopes: {
        tenantId: this.context.tenantId,
        projectId: this.context.projectId!,
      },
      contextId: this.context.contextId!,
      taskId: this.context.taskId!,
      toolCallId: artifact.toolCallId,
      artifact: artifactToSave,
    });

    if (!result.created && result.existing) {
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
      let cleaned = value;

      cleaned = cleaned
        .replace(/\u0000/g, '') // Remove null bytes
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // Remove control chars

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
   * Extract properties from data using schema-defined fields and custom selectors
   */
  private extractPropsFromSchema(
    item: any,
    schema: Record<string, any>,
    customSelectors: Record<string, string>
  ): Record<string, any> {
    const extracted: Record<string, any> = {};

    // First, extract from schema properties (field names)
    if (schema.properties) {
      for (const fieldName of Object.keys(schema.properties)) {
        try {
          // Check if there's a custom selector for this field
          const customSelector = customSelectors[fieldName];
          let rawValue;

          if (customSelector) {
            // Use custom JMESPath selector
            const sanitizedSelector = this.sanitizeJMESPathSelector(customSelector);
            rawValue = jmespath.search(item, sanitizedSelector);
          } else {
            // Default to direct field access
            rawValue = item[fieldName];
          }

          if (rawValue !== null && rawValue !== undefined) {
            extracted[fieldName] = this.cleanEscapedContent(rawValue);
          }
        } catch (error) {
          logger.warn(
            { fieldName, error: error instanceof Error ? error.message : 'Unknown error' },
            'Failed to extract schema field'
          );
          // Fallback to direct field access
          const fallbackValue = item[fieldName];
          if (fallbackValue !== null && fallbackValue !== undefined) {
            extracted[fieldName] = this.cleanEscapedContent(fallbackValue);
          }
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

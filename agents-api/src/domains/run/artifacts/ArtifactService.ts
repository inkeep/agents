import {
  type Artifact,
  type ArtifactComponentApiInsert,
  bulkInsertLedgerArtifacts,
  type FullExecutionContext,
  getLedgerArtifacts,
  getTask,
  listTaskIdsByContextId,
  upsertLedgerArtifact,
} from '@inkeep/agents-core';
import jmespath from 'jmespath';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { toolSessionManager } from '../agents/services/ToolSessionManager';
import { isBlobUri } from '../services/blob-storage';
import { sanitizeArtifactBinaryData } from '../services/blob-storage/artifact-binary-sanitizer';
import { agentSessionManager } from '../session/AgentSession';
import {
  type ExtendedJsonSchema,
  extractFullFields,
  extractPreviewFields,
} from '../utils/schema-validation';
import { setSpanWithError, tracer } from '../utils/tracer';
import { detectOversizedArtifact } from './artifact-utils';

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
  metadata?: {
    isOversized?: boolean;
    retrievalBlocked?: boolean;
    originalTokenSize?: number;
    contextWindowSize?: number;
    toolName?: string;
    toolArgs?: unknown;
    toolCallId?: string;
    baseSelector?: string;
    detailsSelector?: Record<string, string>;
    sessionId?: string;
    artifactType?: string;
  };
}

export interface ArtifactCreateRequest {
  artifactId: string;
  toolCallId: string;
  type: string;
  baseSelector: string;
  detailsSelector?: Record<string, string>;
}

export interface ArtifactServiceContext {
  executionContext: FullExecutionContext;
  sessionId?: string;
  taskId?: string;
  contextId?: string;
  artifactComponents?: ArtifactComponentApiInsert[];
  streamRequestId?: string;
  subAgentId?: string;
}

interface BinaryChildArtifactResult {
  refs: Map<string, { artifactId: string; toolCallId: string }>;
  childArtifactIds: string[];
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
   * Get raw tool result by toolCallId from the current session.
   * Unwraps MCP-style content arrays; returns the value as-is for non-MCP results.
   */
  getToolResultRaw(toolCallId: string): unknown {
    if (!this.context.sessionId) return undefined;

    const record = toolSessionManager.getToolResult(this.context.sessionId, toolCallId);
    if (!record) return undefined;

    if (record.result?.failed === true) {
      logger.warn(
        { toolCallId, toolName: record.toolName, error: record.result.error },
        'Referenced tool call result is a failed/error result'
      );
      return undefined;
    }

    const result = record.result;

    // Unwrap MCP-style content array
    const first = result?.content?.[0];
    if (first?.type === 'text') return first.text;
    if (first?.type === 'image') {
      return { data: first.data, encoding: 'base64', mimeType: first.mimeType };
    }

    // Unwrap AI SDK function tool output: { type: "text", value: "..." }
    if (result?.type === 'text' && typeof result?.value === 'string') return result.value;

    return result;
  }

  /**
   * Get all artifacts for a context from database
   */
  async getContextArtifacts(contextId: string): Promise<Map<string, any>> {
    const artifacts = new Map<string, any>();
    const { tenantId, projectId } = this.context.executionContext;

    try {
      const taskIds = await listTaskIdsByContextId(runDbClient)({
        contextId: contextId,
        scopes: { tenantId, projectId },
      });

      for (const taskId of taskIds) {
        const task = await getTask(runDbClient)({
          id: taskId,
          scopes: { tenantId, projectId },
        });
        if (!task) {
          logger.warn({ taskId }, 'Task not found when fetching artifacts');
          continue;
        }

        const taskArtifacts = await getLedgerArtifacts(runDbClient)({
          scopes: { tenantId, projectId },
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
    subAgentId?: string,
    contextWindowSize?: number
  ): Promise<ArtifactSummaryData | null> {
    if (!this.context.sessionId) {
      logger.warn({ request }, 'No session ID available for artifact creation');
      return null;
    }

    const toolResultRecord = toolSessionManager.getToolResult(
      this.context.sessionId,
      request.toolCallId
    );
    if (!toolResultRecord) {
      logger.warn(
        { request, sessionId: this.context.sessionId },
        'Tool result not found for artifact'
      );
      return null;
    }

    // Extract tool arguments and result
    const toolArgs = toolResultRecord.args;
    const toolResult = toolResultRecord.result;

    try {
      const toolResultData =
        toolResult && typeof toolResult === 'object' && !Array.isArray(toolResult)
          ? Object.fromEntries(
              Object.entries(toolResult).filter(([key]) => key !== '_structureHints')
            )
          : toolResult;

      let sanitizedBaseSelector = this.sanitizeJMESPathSelector(request.baseSelector);

      // Strip 'result.' prefix if it exists (tool results don't have this wrapper)
      if (sanitizedBaseSelector.startsWith('result.')) {
        sanitizedBaseSelector = sanitizedBaseSelector.slice('result.'.length);
      }

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

      let previewSchema: any = null;
      let fullSchema: any = null;

      if (component?.props) {
        previewSchema = extractPreviewFields(component.props as ExtendedJsonSchema);
        fullSchema = extractFullFields(component.props as ExtendedJsonSchema);

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

      // Validate extracted data against the actual schemas used for extraction
      const schemaValidation = this.validateExtractedData(
        request.artifactId,
        request.type,
        cleanedSummaryData,
        cleanedFullData,
        previewSchema,
        fullSchema,
        component?.props
      );

      const artifactData: ArtifactSummaryData = {
        artifactId: request.artifactId,
        toolCallId: request.toolCallId,
        name: 'Processing...',
        description: 'Name and description being generated...',
        type: request.type,
        data: cleanedSummaryData,
      };

      await this.persistArtifact(
        request,
        cleanedSummaryData,
        cleanedFullData,
        subAgentId,
        schemaValidation,
        contextWindowSize,
        toolArgs
      );

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

    const { tenantId, projectId } = this.context.executionContext;

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
      const cached = this.createdArtifacts.get(key);
      if (!cached) {
        logger.warn({ artifactId, toolCallId }, 'Cached artifact not found');
        return null;
      }
      return this.formatArtifactSummaryData(cached, artifactId, toolCallId);
    }

    if (artifactMap?.has(key)) {
      const artifact = artifactMap.get(key);
      return this.formatArtifactSummaryData(artifact, artifactId, toolCallId);
    }

    try {
      if (!projectId || !this.context.taskId) {
        logger.warn(
          { artifactId, toolCallId },
          'No projectId or taskId available for artifact lookup'
        );
        return null;
      }

      let artifacts: any[] = [];
      artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
        artifactId,
        toolCallId: toolCallId,
      });

      if (artifacts.length > 0) {
        return this.formatArtifactSummaryData(artifacts[0], artifactId, toolCallId);
      }

      artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
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

    const { tenantId, projectId } = this.context.executionContext;

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
      const cached = this.createdArtifacts.get(key);
      if (!cached) {
        logger.warn({ artifactId, toolCallId }, 'Cached artifact not found');
        return null;
      }
      return this.formatArtifactFullData(cached, artifactId, toolCallId);
    }

    if (artifactMap?.has(key)) {
      const artifact = artifactMap.get(key);
      return this.formatArtifactFullData(artifact, artifactId, toolCallId);
    }

    try {
      if (!projectId || !this.context.taskId) {
        logger.warn(
          { artifactId, toolCallId },
          'No projectId or taskId available for artifact lookup'
        );
        return null;
      }

      let artifacts: any[] = [];

      artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
        artifactId,
        toolCallId: toolCallId,
      });

      if (artifacts.length > 0) {
        return this.formatArtifactFullData(artifacts[0], artifactId, toolCallId);
      }

      artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
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
    // Try multiple data sources with logging for fallback usage
    let data = artifact.parts?.[0]?.data?.summary;
    let dataSource = 'parts[0].data.summary';

    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      // Fallback 1: Try parts[0].data directly
      data = artifact.parts?.[0]?.data;
      if (data && !(typeof data === 'object' && Object.keys(data).length === 0)) {
        dataSource = 'parts[0].data (fallback)';
        logger.debug(
          { artifactId, toolCallId, dataSource },
          'Using fallback data source for artifact summary'
        );
      } else {
        // Fallback 2: Try artifact.data directly
        data = artifact.data;
        if (data && !(typeof data === 'object' && Object.keys(data).length === 0)) {
          dataSource = 'artifact.data (fallback)';
          logger.debug(
            { artifactId, toolCallId, dataSource },
            'Using fallback data source for artifact summary'
          );
        } else {
          // Final fallback: empty object with warning
          data = {};
          dataSource = 'empty (no data found)';
          logger.warn(
            {
              artifactId,
              toolCallId,
              artifactStructure: {
                hasParts: !!artifact.parts,
                partsLength: artifact.parts?.length,
                hasPartsData: !!artifact.parts?.[0]?.data,
                hasPartsSummary: !!artifact.parts?.[0]?.data?.summary,
                hasArtifactData: !!artifact.data,
                artifactKeys: Object.keys(artifact || {}),
              },
            },
            'No valid data found for artifact summary - using empty object'
          );
        }
      }
    }

    return {
      artifactId,
      toolCallId,
      name: artifact.name || 'Processing...',
      description: artifact.description || 'Name and description being generated...',
      type: artifact.metadata?.artifactType || artifact.artifactType,
      data,
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
    // Try multiple data sources with logging for fallback usage
    let data = artifact.parts?.[0]?.data?.full;
    let dataSource = 'parts[0].data.full';

    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      // Fallback 1: Try parts[0].data directly
      data = artifact.parts?.[0]?.data;
      if (data && !(typeof data === 'object' && Object.keys(data).length === 0)) {
        dataSource = 'parts[0].data (fallback)';
        logger.debug(
          { artifactId, toolCallId, dataSource },
          'Using fallback data source for artifact full data'
        );
      } else {
        // Fallback 2: Try artifact.data directly
        data = artifact.data;
        if (data && !(typeof data === 'object' && Object.keys(data).length === 0)) {
          dataSource = 'artifact.data (fallback)';
          logger.debug(
            { artifactId, toolCallId, dataSource },
            'Using fallback data source for artifact full data'
          );
        } else {
          // Final fallback: empty object with warning
          data = {};
          dataSource = 'empty (no data found)';
          logger.warn(
            {
              artifactId,
              toolCallId,
              artifactStructure: {
                hasParts: !!artifact.parts,
                partsLength: artifact.parts?.length,
                hasPartsData: !!artifact.parts?.[0]?.data,
                hasPartsFull: !!artifact.parts?.[0]?.data?.full,
                hasArtifactData: !!artifact.data,
                artifactKeys: Object.keys(artifact || {}),
              },
            },
            'No valid data found for artifact full data - using empty object'
          );
        }
      }
    }

    return {
      artifactId,
      toolCallId,
      name: artifact.name || 'Processing...',
      description: artifact.description || 'Name and description being generated...',
      type: artifact.metadata?.artifactType || artifact.artifactType,
      data,
      metadata: artifact.metadata,
    };
  }

  /**
   * Validate extracted data against the schemas used for extraction
   */
  private validateExtractedData(
    artifactId: string,
    artifactType: string,
    summaryData: Record<string, any>,
    fullData: Record<string, any>,
    previewSchema: any,
    fullSchema: any,
    originalProps?: any
  ): {
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
  } {
    const validateAgainstSchema = (data: Record<string, any>, schema: any) => {
      const actualFields = Object.keys(data || {});
      const expectedFields = schema?.properties ? Object.keys(schema.properties) : [];
      const missingFields = expectedFields.filter((field: string) => !(field in (data || {})));
      const extraFields = actualFields.filter((field: string) => !expectedFields.includes(field));

      // Check required fields specifically
      const requiredFields = schema?.required || [];
      const missingRequired = requiredFields.filter((field: string) => !(field in (data || {})));

      return {
        hasExpectedFields: missingFields.length === 0,
        missingFields,
        extraFields,
        expectedFields,
        actualFields,
        hasRequiredFields: missingRequired.length === 0,
        missingRequired,
      };
    };

    const summaryValidation = validateAgainstSchema(summaryData, previewSchema);
    const fullValidation = validateAgainstSchema(fullData, fullSchema);

    // Log and return early if required fields are missing from summary data
    if (!summaryValidation.hasRequiredFields) {
      logger.error(
        {
          artifactId,
          artifactType,
          requiredFields: summaryValidation.missingRequired,
          actualFields: summaryValidation.actualFields,
          schemaExpected: previewSchema?.properties ? Object.keys(previewSchema.properties) : [],
        },
        'Artifact creation failed due to missing required fields - continuing with generation'
      );

      // Return validation result indicating failure to prevent generation crash
      return {
        summary: summaryValidation,
        full: fullValidation,
        schemaFound: !!previewSchema,
      };
    }

    // Log validation results
    if (!summaryValidation.hasExpectedFields || summaryValidation.extraFields.length > 0) {
      logger.warn(
        {
          artifactId,
          artifactType,
          dataType: 'summary',
          expectedFields: summaryValidation.expectedFields,
          actualFields: summaryValidation.actualFields,
          missingFields: summaryValidation.missingFields,
          extraFields: summaryValidation.extraFields,
        },
        'Summary data structure does not match preview schema'
      );
    }

    if (!fullValidation.hasExpectedFields || fullValidation.extraFields.length > 0) {
      logger.warn(
        {
          artifactId,
          artifactType,
          dataType: 'full',
          expectedFields: fullValidation.expectedFields,
          actualFields: fullValidation.actualFields,
          missingFields: fullValidation.missingFields,
          extraFields: fullValidation.extraFields,
        },
        'Full data structure does not match full schema'
      );
    }

    return {
      summary: summaryValidation,
      full: fullValidation,
      schemaFound: !!originalProps,
    };
  }

  /**
   * Persist artifact to database vian agent session
   */
  private async persistArtifact(
    request: ArtifactCreateRequest,
    summaryData: Record<string, any>,
    fullData: Record<string, any>,
    subAgentId?: string,
    schemaValidation?: any,
    contextWindowSize?: number,
    toolArgs?: any
  ): Promise<void> {
    const effectiveAgentId = subAgentId || this.context.subAgentId;

    // Detect if artifact data is oversized
    const oversizedDetection = detectOversizedArtifact(fullData, contextWindowSize, {
      artifactId: request.artifactId,
      toolCallId: request.toolCallId,
    });

    // Enhance summaryData with oversized warning if needed
    const enhancedSummaryData = oversizedDetection.isOversized
      ? {
          ...summaryData,
          _oversizedWarning: oversizedDetection.oversizedWarning,
          _structureInfo: oversizedDetection.structureInfo,
        }
      : summaryData;

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
          summaryData: enhancedSummaryData,
          data: fullData,
          subAgentId: effectiveAgentId,
          metadata: {
            toolCallId: request.toolCallId,
            baseSelector: request.baseSelector,
            detailsSelector: request.detailsSelector,
            sessionId: this.context.sessionId,
            artifactType: request.type,
            toolArgs: toolArgs,
            isOversized: oversizedDetection.isOversized,
            originalTokenSize: oversizedDetection.originalTokenSize,
            contextWindowSize: oversizedDetection.contextWindowSize,
            retrievalBlocked: oversizedDetection.retrievalBlocked,
          },
          schemaValidation: schemaValidation || {
            summary: {
              hasExpectedFields: true,
              missingFields: [],
              extraFields: [],
              expectedFields: [],
              actualFields: [],
              hasRequiredFields: true,
              missingRequired: [],
            },
            full: {
              hasExpectedFields: true,
              missingFields: [],
              extraFields: [],
              expectedFields: [],
              actualFields: [],
              hasRequiredFields: true,
              missingRequired: [],
            },
            schemaFound: false,
          },
          tenantId: this.context.executionContext.tenantId,
          projectId: this.context.executionContext.projectId,
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
      parts: [{ data: { summary: artifactData.data, full: fullData } }],
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
    summaryData?: Record<string, any>;
    metadata?: Record<string, any>;
    toolCallId?: string;
  }): Promise<{ binaryChildArtifactCount: number; binaryChildArtifactIds: string[] }> {
    const { tenantId, projectId } = this.context.executionContext;

    const sanitizedData = (await sanitizeArtifactBinaryData(artifact.data, {
      tenantId,
      projectId,
      artifactId: artifact.artifactId,
    })) as Record<string, any>;
    const sanitizedSummaryData = artifact.summaryData
      ? ((await sanitizeArtifactBinaryData(artifact.summaryData, {
          tenantId,
          projectId,
          artifactId: artifact.artifactId,
        })) as Record<string, any>)
      : undefined;

    const binaryChildArtifacts = await this.createBinaryChildArtifacts({
      parentArtifactId: artifact.artifactId,
      parentArtifactType: artifact.type,
      toolCallId: artifact.toolCallId,
      value: sanitizedData,
    });

    let fullData = this.attachBinaryArtifactRefs(
      sanitizedData,
      binaryChildArtifacts.refs
    ) as Record<string, any>;
    let summaryData = this.attachBinaryArtifactRefs(
      sanitizedSummaryData || fullData,
      binaryChildArtifacts.refs
    ) as Record<string, any>;

    if (this.context.artifactComponents) {
      const artifactComponent = this.context.artifactComponents.find(
        (ac) => ac.name === artifact.type
      );
      if (artifactComponent?.props) {
        try {
          const schema = artifactComponent.props as ExtendedJsonSchema;
          const previewSchema = extractPreviewFields(schema);
          const fullSchema = extractFullFields(schema);

          summaryData = this.filterBySchema(summaryData, previewSchema);
          fullData = this.filterBySchema(fullData, fullSchema);
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
      createdAt: new Date().toISOString(),
    };

    const result = await upsertLedgerArtifact(runDbClient)({
      scopes: {
        tenantId,
        projectId,
      },
      // biome-ignore lint/style/noNonNullAssertion: Context ID is guaranteed to be set
      contextId: this.context.contextId!,
      // biome-ignore lint/style/noNonNullAssertion: Task ID is guaranteed to be set
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

    return {
      binaryChildArtifactCount: binaryChildArtifacts.childArtifactIds.length,
      binaryChildArtifactIds: binaryChildArtifacts.childArtifactIds,
    };
  }

  private async createBinaryChildArtifacts(params: {
    parentArtifactId: string;
    parentArtifactType: string;
    toolCallId?: string;
    value: unknown;
  }): Promise<BinaryChildArtifactResult> {
    return tracer.startActiveSpan(
      'artifact.create_binary_children',
      {
        attributes: {
          'artifact.id': params.parentArtifactId,
          'artifact.type': params.parentArtifactType,
          'artifact.tool_call_id': params.toolCallId || 'unknown',
          'tenant.id': this.context.executionContext.tenantId,
          'project.id': this.context.executionContext.projectId,
          'context.id': this.context.contextId || 'unknown',
        },
      },
      async (span) => {
        try {
          if (!this.context.taskId || !this.context.contextId) {
            span.setAttributes({
              'artifact.binary_child_count': 0,
              'artifact.binary_child_ids': JSON.stringify([]),
              'artifact.binary_child_hashes': JSON.stringify([]),
            });
            return { refs: new Map(), childArtifactIds: [] };
          }

          const binaryParts = this.collectBlobBackedBinaryParts(params.value);
          if (binaryParts.length === 0) {
            span.setAttributes({
              'artifact.binary_child_count': 0,
              'artifact.binary_child_ids': JSON.stringify([]),
              'artifact.binary_child_hashes': JSON.stringify([]),
            });
            return { refs: new Map(), childArtifactIds: [] };
          }

          const refs = new Map<string, { artifactId: string; toolCallId: string }>();
          const dedupeByHash = new Map<string, { artifactId: string; toolCallId: string }>();
          const childArtifacts: Artifact[] = [];
          const childHashes: string[] = [];

          for (const part of binaryParts) {
            const hash =
              this.extractContentHashFromBlobUri(part.data) || this.fallbackHash(part.data);
            const dedupeKey = `${params.toolCallId || params.parentArtifactId}:${hash}`;
            const existing = dedupeByHash.get(dedupeKey);
            if (existing) {
              refs.set(part.data, existing);
              continue;
            }

            const childArtifactId = this.buildBinaryChildArtifactId(
              params.toolCallId,
              params.parentArtifactId,
              hash
            );
            const childToolCallId = params.toolCallId || `${params.parentArtifactId}:binary`;

            childArtifacts.push({
              artifactId: childArtifactId,
              type: `${params.parentArtifactType}-binary-child`,
              name: `${params.parentArtifactType} binary ${hash.slice(0, 12)}`,
              description: 'Binary payload extracted from parent artifact',
              parts: [
                {
                  kind: 'data',
                  data: {
                    blobUri: part.data,
                    mimeType: part.mimeType,
                    contentHash: hash,
                    binaryType: part.type,
                  },
                },
              ],
              metadata: {
                derivedFrom: params.parentArtifactId,
                parentArtifactType: params.parentArtifactType,
                toolCallId: params.toolCallId,
                contentHash: hash,
                mimeType: part.mimeType,
                visibility: 'internal',
              },
              createdAt: new Date().toISOString(),
            });

            const reference = { artifactId: childArtifactId, toolCallId: childToolCallId };
            dedupeByHash.set(dedupeKey, reference);
            refs.set(part.data, reference);
            childHashes.push(hash);
          }

          await bulkInsertLedgerArtifacts(runDbClient)({
            scopes: this.context.executionContext,
            contextId: this.context.contextId,
            taskId: this.context.taskId,
            toolCallId: params.toolCallId || null,
            artifacts: childArtifacts,
          });

          const childArtifactIds = childArtifacts.map((artifact) => artifact.artifactId);
          span.setAttributes({
            'artifact.binary_child_count': childArtifactIds.length,
            'artifact.binary_child_ids': JSON.stringify(childArtifactIds),
            'artifact.binary_child_hashes': JSON.stringify(childHashes),
          });

          return { refs, childArtifactIds };
        } catch (error) {
          setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
    );
  }

  private collectBlobBackedBinaryParts(
    value: unknown
  ): Array<{ type: string; data: string; mimeType?: string }> {
    const inStack = new WeakSet<object>();
    const collected: Array<{ type: string; data: string; mimeType?: string }> = [];

    const visit = (current: unknown) => {
      if (this.isBlobBackedBinaryPart(current)) {
        collected.push(current);
        return;
      }

      if (Array.isArray(current)) {
        if (inStack.has(current)) return;
        inStack.add(current);
        for (const item of current) visit(item);
        inStack.delete(current);
        return;
      }

      if (current && typeof current === 'object') {
        if (inStack.has(current as object)) return;
        inStack.add(current as object);
        for (const next of Object.values(current as Record<string, unknown>)) {
          visit(next);
        }
        inStack.delete(current as object);
      }
    };

    visit(value);
    return collected;
  }

  private attachBinaryArtifactRefs(
    value: unknown,
    refs: Map<string, { artifactId: string; toolCallId: string }>
  ): unknown {
    if (refs.size === 0) {
      return value;
    }

    const inStack = new WeakSet<object>();

    const visit = (current: unknown): unknown => {
      if (this.isBlobBackedBinaryPart(current)) {
        const ref = refs.get(current.data);
        if (!ref) {
          return current;
        }
        return {
          ...current,
          artifactRef: {
            artifactId: ref.artifactId,
            toolCallId: ref.toolCallId,
          },
        };
      }

      if (Array.isArray(current)) {
        if (inStack.has(current)) return '[Circular Reference]';
        inStack.add(current);
        const next = current.map((item) => visit(item));
        inStack.delete(current);
        return next;
      }

      if (current && typeof current === 'object') {
        if (inStack.has(current as object)) return '[Circular Reference]';
        inStack.add(current as object);
        const next: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
          next[key] = visit(value);
        }
        inStack.delete(current as object);
        return next;
      }

      return current;
    };

    return visit(value);
  }

  private isBlobBackedBinaryPart(
    value: unknown
  ): value is { type: string; data: string; mimeType?: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const maybePart = value as Record<string, unknown>;
    return (
      (maybePart.type === 'image' || maybePart.type === 'file') &&
      typeof maybePart.data === 'string' &&
      isBlobUri(maybePart.data)
    );
  }

  private extractContentHashFromBlobUri(blobUri: string): string | null {
    const match = blobUri.match(/sha256-([a-f0-9]{16,64})\./i);
    return match?.[1] || null;
  }

  private fallbackHash(blobUri: string): string {
    return Buffer.from(blobUri).toString('hex').slice(0, 24);
  }

  private buildBinaryChildArtifactId(
    toolCallId: string | undefined,
    parentArtifactId: string,
    contentHash: string
  ): string {
    const scope = (toolCallId || parentArtifactId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    return `bin_${scope}_${contentHash.slice(0, 24)}`;
  }

  /**
   * Clean up over-escaped strings that have been through multiple JSON serialization cycles
   */
  public cleanEscapedContent(value: any): any {
    if (typeof value === 'string') {
      let cleaned = value;

      cleaned = cleaned
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control chars to remove them
        .replace(/\u0000/g, '') // Remove null bytes
        // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control chars to remove them
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');

      cleaned = cleaned
        .replace(/\\"([^"]+)\\"/g, '"$1"') // \"text\" -> "text"
        .replace(/\\'/g, "'") // \' -> '
        .replace(/\\`/g, '`') // \` -> `
        .replace(/\\\\/g, '\\'); // \\\\ -> \\

      // Aggressively fix over-escaped content
      // Handle the specific pattern we're seeing: \\\\\\n (4 backslashes + n)
      const maxIterations = 10;
      let iteration = 0;
      let previousLength: number;

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
          let rawValue: any;

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

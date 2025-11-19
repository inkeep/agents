import {
  type ArtifactComponentApiInsert,
  executeInBranch,
  getLedgerArtifacts,
  getTask,
  listTaskIdsByContextId,
  type ResolvedRef,
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

  constructor(
    private context: ArtifactServiceContext,
    private ref: ResolvedRef
  ) {}

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
      const taskIds = await executeInBranch(
        {
          dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await listTaskIdsByContextId(db)({
            contextId: contextId,
          });
        }
      );

      for (const taskId of taskIds) {
        const task = await executeInBranch(
          {
            dbClient,
            ref: this.ref,
          },
          async (db) => {
            return await getTask(db)({
              id: taskId,
            });
          }
        );
        if (!task) {
          logger.warn({ taskId }, 'Task not found when fetching artifacts');
          continue;
        }

        const taskArtifacts = await executeInBranch(
          {
            dbClient,
            ref: this.ref,
          },
          async (db) => {
            return await getLedgerArtifacts(db)({
              scopes: { tenantId: this.context.tenantId, projectId: task.projectId },
              taskId,
            });
          }
        );

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
        schemaValidation
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

      let artifacts: any[] = [];
      artifacts = await executeInBranch(
        {
          dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getLedgerArtifacts(db)({
            scopes: { tenantId: this.context.tenantId, projectId: this.context.projectId! },
            artifactId,
            toolCallId: toolCallId,
          });
        }
      );

      if (artifacts.length > 0) {
        return this.formatArtifactSummaryData(artifacts[0], artifactId, toolCallId);
      }

      artifacts = await executeInBranch(
        {
          dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getLedgerArtifacts(db)({
            scopes: { tenantId: this.context.tenantId, projectId: this.context.projectId! },
            artifactId,
            taskId: this.context.taskId,
          });
        }
      );

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

      let artifacts: any[] = [];

      artifacts = await executeInBranch(
        {
          dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getLedgerArtifacts(db)({
            scopes: { tenantId: this.context.tenantId, projectId: this.context.projectId! },
            artifactId,
            toolCallId: toolCallId,
          });
        }
      );

      if (artifacts.length > 0) {
        return this.formatArtifactFullData(artifacts[0], artifactId, toolCallId);
      }

      artifacts = await executeInBranch(
        {
          dbClient,
          ref: this.ref,
        },
        async (db) => {
          return await getLedgerArtifacts(db)({
            scopes: { tenantId: this.context.tenantId, projectId: this.context.projectId! },
            artifactId,
            taskId: this.context.taskId,
          });
        }
      );

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

    // Block artifact creation if required fields are missing from summary data
    if (!summaryValidation.hasRequiredFields) {
      const error = new Error(
        `Cannot save artifact: Missing required fields [${summaryValidation.missingRequired.join(', ')}] ` +
          `for '${artifactType}' schema. ` +
          `Required: [${summaryValidation.missingRequired.join(', ')}]. ` +
          `Found: [${summaryValidation.actualFields.join(', ')}]. ` +
          `Consider using a different artifact component type that matches your data structure.`
      );

      logger.error(
        {
          artifactId,
          artifactType,
          requiredFields: summaryValidation.missingRequired,
          actualFields: summaryValidation.actualFields,
          schemaExpected: previewSchema?.properties ? Object.keys(previewSchema.properties) : [],
        },
        'Blocking artifact save due to missing required fields'
      );

      throw error;
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
    schemaValidation?: any
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

    const result = await executeInBranch(
      {
        dbClient,
        ref: this.ref,
        autoCommit: true,
        commitMessage: 'Save artifact',
      },
      async (db) => {
        return await upsertLedgerArtifact(db)({
          scopes: {
            tenantId: this.context.tenantId,
            projectId: this.context.projectId!,
          },
          contextId: this.context.contextId!,
          taskId: this.context.taskId!,
          toolCallId: artifact.toolCallId,
          artifact: artifactToSave,
        });
      }
    );

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

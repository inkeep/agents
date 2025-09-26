import { getLedgerArtifacts, getTask, listTaskIdsByContextId, ArtifactComponentApiInsert } from '@inkeep/agents-core';
import jmespath from 'jmespath';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { toolSessionManager } from '../agents/ToolSessionManager';
import { graphSessionManager } from './graph-session';

const logger = getLogger('ArtifactParser');

// Common types
export interface StreamPart {
  kind: 'text' | 'data';
  text?: string;
  data?: any;
}

export interface ArtifactData {
  artifactId: string;
  toolCallId: string;
  name: string;
  description: string;
  type?: string; // Artifact type for consistency with summary events
  artifactSummary: any;
}

export interface ArtifactCreateAnnotation {
  artifactId: string;
  toolCallId: string;
  type: string;
  baseSelector: string;
  summaryProps?: Record<string, string>;
  fullProps?: Record<string, string>;
  raw?: string; // Raw annotation text for debugging
}

/**
 * Unified artifact parser that handles all artifact-related parsing and formatting
 * Supports both artifact:ref (references) and artifact:create (inline creation) tags
 * Used by both ResponseFormatter and IncrementalStreamParser to eliminate redundancy
 */
export class ArtifactParser {
  // Shared regex patterns - support both single and double quotes
  private static readonly ARTIFACT_REGEX =
    /<artifact:ref\s+id=(['"])([^'"]*?)\1\s+tool=(['"])([^'"]*?)\3\s*\/>/gs;
  private static readonly ARTIFACT_CHECK_REGEX =
    /<artifact:ref\s+(?=.*id=['"][^'"]+['"])(?=.*tool=['"][^'"]+['"])[^>]*\/>/;
  
  // Artifact creation patterns
  private static readonly ARTIFACT_CREATE_REGEX = 
    /<artifact:create\s+([^>]+?)(?:\s*\/)?>(?:(.*?)<\/artifact:create>)?/gs;
  private static readonly ATTR_REGEX = /(\w+)="([^"]*)"|(\w+)='([^']*)'|(\w+)=({[^}]+})/g;

  // Simple patterns for detecting incomplete artifacts at end of text
  private static readonly ARTIFACT_PATTERNS = [
    '<a', '<ar', '<art', '<arti', '<artif', '<artifa', '<artifac', '<artifact',
    '<artifact:', '<artifact:r', '<artifact:re', '<artifact:ref',
    '<artifact:c', '<artifact:cr', '<artifact:cre', '<artifact:crea', 
    '<artifact:creat', '<artifact:create'
  ];
  private static readonly INCOMPLETE_CREATE_REGEX = 
    /<artifact:create(?![^>]*(?:\/>|<\/artifact:create>))/;

  // Cache for artifacts created in this session
  private createdArtifacts: Map<string, any> = new Map();
  
  // Additional context for artifact creation
  private sessionId?: string;
  private taskId?: string;
  private projectId?: string;
  private contextId?: string;
  private artifactComponents?: ArtifactComponentApiInsert[];
  private streamRequestId?: string;
  private agentId?: string;

  constructor(
    private tenantId: string,
    options?: {
      sessionId?: string;
      taskId?: string;
      projectId?: string;
      contextId?: string;
      artifactComponents?: ArtifactComponentApiInsert[];
      streamRequestId?: string;
      agentId?: string;
    }
  ) {
    this.sessionId = options?.sessionId;
    this.taskId = options?.taskId;
    this.projectId = options?.projectId;
    this.contextId = options?.contextId;
    this.artifactComponents = options?.artifactComponents;
    this.streamRequestId = options?.streamRequestId;
    this.agentId = options?.agentId;
  }

  /**
   * Check if text contains complete artifact markers (ref or create)
   */
  hasArtifactMarkers(text: string): boolean {
    return ArtifactParser.ARTIFACT_CHECK_REGEX.test(text) || 
           ArtifactParser.ARTIFACT_CREATE_REGEX.test(text);
  }

  /**
   * Check if text has incomplete artifact marker (for streaming)
   * More robust detection that handles streaming fragments
   */
  hasIncompleteArtifact(text: string): boolean {
    // Check if text ends with any partial artifact pattern
    const endsWithPattern = ArtifactParser.ARTIFACT_PATTERNS.some(pattern => 
      text.endsWith(pattern)
    );
    
    return (
      endsWithPattern ||
      /<artifact:ref[^>]+$/.test(text) || // Incomplete artifact ref at end
      /<artifact:create[^>]*$/.test(text) || // Incomplete artifact create at end
      (ArtifactParser.INCOMPLETE_CREATE_REGEX.test(text) && !text.includes('</artifact:create>')) ||
      this.findSafeTextBoundary(text) < text.length
    );
  }

  /**
   * Find safe text boundary before incomplete artifacts (for streaming)
   * Enhanced to handle streaming chunks that split in the middle of artifacts
   */
  findSafeTextBoundary(text: string): number {
    // First check for incomplete artifact patterns at the end
    const endPatterns = [
      /<artifact:ref(?![^>]*\/>).*$/, // artifact:ref that doesn't end with />
      /<artifact:create(?![^>]*(?:\/>|<\/artifact:create>)).*$/, // incomplete artifact:create
    ];

    for (const pattern of endPatterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        return match.index;
      }
    }

    // Look for incomplete artifact patterns anywhere in text
    for (const pattern of ArtifactParser.ARTIFACT_PATTERNS) {
      const lastIndex = text.lastIndexOf(pattern);
      if (lastIndex !== -1) {
        const textAfterPattern = text.slice(lastIndex);
        // If pattern is found and there's no complete tag after it, it might be incomplete
        if (!textAfterPattern.includes('/>') && !textAfterPattern.includes('</artifact:')) {
          return lastIndex;
        }
      }
    }

    return text.length;
  }

  /**
   * Get all artifacts for a context (with caching opportunity)
   */
  async getContextArtifacts(contextId: string): Promise<Map<string, any>> {
    const artifacts = new Map<string, any>();

    try {
      const taskIds = await listTaskIdsByContextId(dbClient)({
        contextId: contextId,
      });

      for (const taskId of taskIds) {
        // Get task to retrieve projectId
        const task = await getTask(dbClient)({
          id: taskId,
        });
        if (!task) {
          logger.warn({ taskId }, 'Task not found when fetching artifacts');
          continue;
        }

        const taskArtifacts = await getLedgerArtifacts(dbClient)({
          scopes: { tenantId: this.tenantId, projectId: task.projectId },
          taskId,
        });

        for (const artifact of taskArtifacts) {
          // For cache key, use toolCallId from metadata (the unique identifier)
          // This matches how we create artifacts with toolCallId
          const toolCallId = artifact.metadata?.toolCallId || '';
          if (toolCallId) {
            const key = `${artifact.artifactId}:${toolCallId}`;
            artifacts.set(key, artifact);
          }
          // Also store with taskId as fallback for backwards compatibility
          const taskKey = `${artifact.artifactId}:${artifact.taskId}`;
          artifacts.set(taskKey, artifact);
        }
      }

      logger.debug({ contextId, count: artifacts.size }, 'Loaded context artifacts');
    } catch (error) {
      logger.error({ error, contextId }, 'Error loading context artifacts');
    }

    return artifacts;
  }

  /**
   * Convert raw artifact to standardized data format
   */
  private formatArtifactData(artifact: any, artifactId: string, toolCallId: string): ArtifactData {
    return {
      artifactId,
      toolCallId,
      name: artifact.name || 'Processing...',
      description: artifact.description || 'Name and description being generated...',
      type: artifact.metadata?.artifactType || artifact.artifactType, // Map artifactType to type for consistency
      artifactSummary: artifact.parts?.[0]?.data?.summary || {},
    };
  }

  /**
   * Parse attributes from the artifact:create tag
   */
  private parseCreateAttributes(attrString: string): ArtifactCreateAnnotation | null {
    const attrs: Record<string, any> = {};
    let match;

    ArtifactParser.ATTR_REGEX.lastIndex = 0;
    while ((match = ArtifactParser.ATTR_REGEX.exec(attrString)) !== null) {
      const key = match[1] || match[3] || match[5];
      let value = match[2] || match[4] || match[6];
      
      // Try to parse JSON values for props
      if (value && value.startsWith('{')) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if JSON parse fails
        }
      }
      
      attrs[key] = value;
    }

    // Debug log the parsed attributes
    logger.debug({ attrs, attrString }, 'Parsed artifact:create attributes');

    // Validate required attributes
    if (!attrs.id || !attrs.tool || !attrs.type || !attrs.base) {
      logger.warn({ attrs, attrString }, 'Missing required attributes in artifact annotation');
      return null;
    }

    return {
      artifactId: attrs.id,
      toolCallId: attrs.tool,
      type: attrs.type,
      baseSelector: attrs.base,
      summaryProps: attrs.summary || {},
      fullProps: attrs.full || {},
    };
  }

  /**
   * Parse artifact creation annotations from text
   */
  private parseCreateAnnotations(text: string): ArtifactCreateAnnotation[] {
    const annotations: ArtifactCreateAnnotation[] = [];
    const matches = [...text.matchAll(ArtifactParser.ARTIFACT_CREATE_REGEX)];
    
    logger.debug({ 
      textContainsCreate: text.includes('artifact:create'),
      matchCount: matches.length,
      textLength: text.length 
    }, 'parseCreateAnnotations called');

    for (const match of matches) {
      const [fullMatch, attributes] = match;
      logger.debug({ fullMatch, attributes }, 'Found artifact:create match');
      const annotation = this.parseCreateAttributes(attributes);
      if (annotation) {
        annotation.raw = fullMatch;
        annotations.push(annotation);
      }
    }

    return annotations;
  }

  /**
   * Extract artifact data from a create annotation using tool results
   */
  private async extractFromCreateAnnotation(
    annotation: ArtifactCreateAnnotation
  ): Promise<ArtifactData | null> {
    if (!this.sessionId) {
      logger.warn({ annotation }, 'No session ID available for artifact extraction');
      return null;
    }

    // Get the tool result from the session
    const toolResult = toolSessionManager.getToolResult(this.sessionId, annotation.toolCallId);
    if (!toolResult) {
      logger.warn({ annotation, sessionId: this.sessionId }, 'Tool result not found for artifact');
      return null;
    }

    try {
      // Tool result is already parsed in Agent.ts, no need to parse again
      // Clean out structure hints which are not part of the actual data
      const toolResultData = toolResult && typeof toolResult === 'object' && !Array.isArray(toolResult)
        ? Object.fromEntries(Object.entries(toolResult).filter(([key]) => key !== '_structureHints'))
        : toolResult;
      
      // Sanitize JMESPath selector to handle common syntax issues
      const sanitizedBaseSelector = this.sanitizeJMESPathSelector(annotation.baseSelector);
      
      // Use base selector to get to the data
      // Debug logging to understand what data we're working with
      logger.debug({
        annotation: annotation.artifactId,
        originalBaseSelector: annotation.baseSelector,
        sanitizedBaseSelector,
        toolResultTopLevelKeys: Object.keys(toolResultData || {}),
        resultKeys: Object.keys(toolResultData?.result || {}),
        structuredContentKeys: Object.keys(toolResultData?.result?.structuredContent || {}),
        contentArrayLength: toolResultData?.result?.structuredContent?.content?.length || 0,
        firstThreeItems: toolResultData?.result?.structuredContent?.content?.slice(0, 3)?.map(item => ({
          title: item?.title,
          record_type: item?.record_type,
          type: item?.type
        }))
      }, 'Debug: Tool result structure before JMESPath');
      
      let selectedData = jmespath.search(toolResultData, sanitizedBaseSelector);
      
      logger.debug({
        annotation: annotation.artifactId,
        baseSelector: annotation.baseSelector,
        selectedDataType: typeof selectedData,
        selectedDataKeys: selectedData && typeof selectedData === 'object' ? Object.keys(selectedData) : null,
        selectedData: selectedData
      }, 'Debug: JMESPath selector result');
      
      // If selector returns an array, take the first item
      if (Array.isArray(selectedData)) {
        logger.debug({ 
          annotation, 
          arrayLength: selectedData.length,
          baseSelector: annotation.baseSelector
        }, 'Base selector returned array - selecting first item');
        selectedData = selectedData.length > 0 ? selectedData[0] : {};
      }
      
      if (!selectedData) {
        logger.warn({ 
          annotation, 
          baseSelector: annotation.baseSelector,
          availableTopLevelKeys: Object.keys(toolResultData?.result || {}),
          structuredContentKeys: Object.keys(toolResultData?.result?.structuredContent || {}),
          contentArrayLength: toolResultData?.result?.structuredContent?.content?.length || 0
        }, 'Base selector returned no data - using empty object as fallback');
        // Use empty object as fallback so artifact still gets created with placeholders
        selectedData = {};
      }

      // Extract summary and full data using the prop selectors
      const summaryData = this.extractProps(selectedData, annotation.summaryProps || {});
      const fullData = this.extractProps(selectedData, annotation.fullProps || {});
      
      // Find matching artifact component for additional validation
      const component = this.artifactComponents?.find(ac => ac.name === annotation.type);
      
      // Create artifact data for immediate use - always use Processing placeholders
      const artifactData: ArtifactData = {
        artifactId: annotation.artifactId,
        toolCallId: annotation.toolCallId,
        name: 'Processing...',
        description: 'Name and description being generated...',
        type: annotation.type,
        artifactSummary: component?.summaryProps ? 
          this.filterBySchema(summaryData, component.summaryProps) : 
          summaryData,
      };

      // Record artifact in GraphSession for persistence (similar to save_tool_result)
      if (this.streamRequestId && this.agentId && this.taskId) {
        await graphSessionManager.recordEvent(this.streamRequestId, 'artifact_saved', this.agentId, {
          artifactId: annotation.artifactId,
          taskId: this.taskId, // Use session taskId for database consistency
          toolCallId: annotation.toolCallId, // Keep tool call ID for metadata
          artifactType: annotation.type,
          summaryProps: summaryData,
          fullProps: fullData,
          metadata: {
            toolCallId: annotation.toolCallId,
            baseSelector: annotation.baseSelector,
            summaryProps: annotation.summaryProps,
            fullProps: annotation.fullProps,
            sessionId: this.sessionId,
            artifactType: annotation.type,
          },
          // Session info needed for saving to ledger
          tenantId: this.tenantId,
          projectId: this.projectId,
          contextId: this.contextId,
          // Mark as pending - needs name/description generation
          pendingGeneration: true,
        });
      }

      // Cache the created artifact in graph session for immediate access by artifact:ref tags
      const cacheKey = `${annotation.artifactId}:${annotation.toolCallId}`;
      const artifactForCache = {
        ...artifactData,
        parts: [{ data: { summary: artifactData.artifactSummary, full: fullData } }],
        metadata: { artifactType: annotation.type, toolCallId: annotation.toolCallId },
        taskId: this.taskId,  // Store taskId for database scoping
      };
      
      // Store in both local cache and graph session for this request
      this.createdArtifacts.set(cacheKey, artifactForCache);
      
      if (this.streamRequestId) {
        await graphSessionManager.setArtifactCache(this.streamRequestId, cacheKey, artifactForCache);
      }

      return artifactData;
    } catch (error) {
      logger.error({ error, annotation }, 'Failed to extract artifact from annotation');
      return null;
    }
  }

  /**
   * Sanitize JMESPath selector to fix common syntax issues from LLMs
   */
  private sanitizeJMESPathSelector(selector: string): string {
    // Fix double quotes to single quotes in filter expressions
    // Pattern: [?field=="value"] -> [?field=='value']
    let sanitized = selector.replace(
      /=="([^"]*)"/g,
      "=='$1'"
    );
    
    // Fix contains(@, "text") syntax - should be contains(field, "text")  
    // Pattern: [?field ~ contains(@, "text")] -> [?contains(field, "text")]
    sanitized = sanitized.replace(
      /\[\\?\?(\w+)\s*~\s*contains\(@,\s*\\?"([^"]*)\\"?\)\]/g, 
      '[?contains($1, `$2`)]'
    );
    
    // Also handle single quotes
    sanitized = sanitized.replace(
      /\[\\?\?(\w+)\s*~\s*contains\(@,\s*'([^']*)'\)\]/g,
      "[?contains($1, '$2')]"
    );
    
    // Fix any remaining ~ operators that aren't valid JMESPath
    sanitized = sanitized.replace(/\s*~\s*/g, ' ');
    
    return sanitized;
  }

  /**
   * Extract properties from data using prop selectors
   */
  private extractProps(
    item: any, 
    propSelectors: Record<string, string>
  ): Record<string, any> {
    const extracted: Record<string, any> = {};
    
    logger.debug({ propSelectors, itemKeys: Object.keys(item || {}) }, 'extractProps called');
    
    for (const [propName, selector] of Object.entries(propSelectors)) {
      try {
        const sanitizedSelector = this.sanitizeJMESPathSelector(selector);
        
        // Log if selector was changed
        if (sanitizedSelector !== selector) {
          logger.info({ 
            propName, 
            originalSelector: selector, 
            sanitizedSelector 
          }, 'Sanitized JMESPath prop selector');
        }
        
        const value = sanitizedSelector ? jmespath.search(item, sanitizedSelector) : item[propName];
        if (value !== null && value !== undefined) {
          extracted[propName] = value;
        }
        logger.debug({ propName, selector: sanitizedSelector, value, extracted: value !== null && value !== undefined }, 'Property extraction');
      } catch (error) {
        logger.warn({ propName, selector, error }, 'Failed to extract property');
        // Try direct property access as fallback
        const fallbackValue = item[propName];
        if (fallbackValue !== null && fallbackValue !== undefined) {
          extracted[propName] = fallbackValue;
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

  /**
   * Parse text with artifact markers into parts array
   * Handles both artifact:ref and artifact:create tags
   * Can work with or without pre-fetched artifact map
   */
  async parseText(text: string, artifactMap?: Map<string, any>): Promise<StreamPart[]> {
    // First, process any artifact:create annotations
    let processedText = text;
    const createAnnotations = this.parseCreateAnnotations(text);
    
    logger.debug({ 
      hasCreateAnnotations: createAnnotations.length > 0,
      annotationCount: createAnnotations.length,
      textLength: text.length 
    }, 'Processing text for artifact annotations');
    
    // Extract artifacts from create annotations and cache them for direct replacement
    const createdArtifactData = new Map<string, ArtifactData>();
    for (const annotation of createAnnotations) {
      const artifactData = await this.extractFromCreateAnnotation(annotation);
      if (artifactData && annotation.raw) {
        // Cache the artifact data for direct replacement
        createdArtifactData.set(annotation.raw, artifactData);
      } else if (annotation.raw) {
        // Remove failed annotations completely for clean output
        processedText = processedText.replace(annotation.raw, '');
        logger.warn({ annotation }, 'Removed failed artifact:create annotation from output');
      }
    }

    // Parse text for both artifact:create and artifact:ref tags
    const parts: StreamPart[] = [];
    
    // First handle direct artifact:create replacements
    const createMatches = [...text.matchAll(ArtifactParser.ARTIFACT_CREATE_REGEX)];
    const refMatches = [...processedText.matchAll(ArtifactParser.ARTIFACT_REGEX)];
    
    // Combine and sort all matches by position
    const allMatches: Array<{ match: RegExpMatchArray; type: 'create' | 'ref' }> = [
      ...createMatches.map(match => ({ match, type: 'create' as const })),
      ...refMatches.map(match => ({ match, type: 'ref' as const }))
    ].sort((a, b) => (a.match.index || 0) - (b.match.index || 0));

    if (allMatches.length === 0) {
      return [{ kind: 'text', text: processedText }];
    }

    let lastIndex = 0;

    for (const { match, type } of allMatches) {
      if (match.index === undefined) continue;
      const matchStart = match.index;
      const fullMatch = match[0];

      // Add text before artifact (using original text for positioning)
      if (matchStart > lastIndex) {
        const textBefore = text.slice(lastIndex, matchStart);
        if (textBefore) {
          parts.push({ kind: 'text', text: textBefore });
        }
      }

      let artifactData: ArtifactData | null = null;

      if (type === 'create') {
        // Direct replacement from create annotation
        artifactData = createdArtifactData.get(fullMatch) || null;
      } else {
        // Handle artifact:ref tags - new regex captures: [fullMatch, quote1, artifactId, quote2, toolCallId]
        const [, , artifactId, , toolCallId] = match;
        // Use toolCallId for cache key (the unique identifier)
        const cacheKey = `${artifactId}:${toolCallId}`;
        
        if (this.createdArtifacts.has(cacheKey)) {
          // Use cached created artifact
          const cached = this.createdArtifacts.get(cacheKey)!;
          artifactData = this.formatArtifactData(cached, artifactId, toolCallId);
        } else {
          // Get from existing artifacts map or database
          artifactData = await this.getArtifactData(artifactId, toolCallId, artifactMap);
        }
      }
      
      if (artifactData) {
        parts.push({ kind: 'data', data: artifactData });
      }
      // If no artifact found, marker is simply removed

      lastIndex = matchStart + fullMatch.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      if (remainingText) {
        parts.push({ kind: 'text', text: remainingText });
      }
    }

    return parts;
  }

  /**
   * Process object/dataComponents for artifact components
   */
  async parseObject(obj: any, artifactMap?: Map<string, any>): Promise<StreamPart[]> {
    // Handle dataComponents array
    if (obj?.dataComponents && Array.isArray(obj.dataComponents)) {
      const parts: StreamPart[] = [];

      for (const component of obj.dataComponents) {
        if (this.isArtifactComponent(component)) {
          const artifactData = await this.getArtifactData(
            component.props.artifact_id,
            component.props.tool_call_id,
            artifactMap
          );
          if (artifactData) {
            parts.push({ kind: 'data', data: artifactData });
          }
        } else if (this.isArtifactCreateComponent(component)) {
          // Handle ArtifactCreate component - extract artifact from tool result
          const createData = await this.extractFromArtifactCreateComponent(component);
          if (createData) {
            parts.push({ kind: 'data', data: createData });
          }
        } else {
          parts.push({ kind: 'data', data: component });
        }
      }

      return parts;
    }

    // Handle single object
    if (this.isArtifactComponent(obj)) {
      const artifactData = await this.getArtifactData(
        obj.props.artifact_id,
        obj.props.tool_call_id,
        artifactMap
      );
      return artifactData ? [{ kind: 'data', data: artifactData }] : [];
    }

    if (this.isArtifactCreateComponent(obj)) {
      const createData = await this.extractFromArtifactCreateComponent(obj);
      return createData ? [{ kind: 'data', data: createData }] : [];
    }

    return [{ kind: 'data', data: obj }];
  }

  /**
   * Check if object is an artifact component
   */
  private isArtifactComponent(obj: any): boolean {
    const result = obj?.name === 'Artifact' && obj?.props?.artifact_id && obj?.props?.tool_call_id;
    logger.debug({ 
      obj, 
      name: obj?.name, 
      artifact_id: obj?.props?.artifact_id, 
      tool_call_id: obj?.props?.tool_call_id,
      result 
    }, 'isArtifactComponent check');
    return result;
  }

  /**
   * Check if object is an artifact create component
   */
  private isArtifactCreateComponent(obj: any): boolean {
    return obj?.name?.startsWith('ArtifactCreate_') && obj?.props?.id && obj?.props?.tool_call_id;
  }

  /**
   * Extract artifact from ArtifactCreate component
   */
  private async extractFromArtifactCreateComponent(component: any): Promise<ArtifactData | null> {
    const props = component.props;
    if (!props || !this.sessionId) {
      return null;
    }

    // Convert component props to annotation format
    const annotation: ArtifactCreateAnnotation = {
      artifactId: props.id,
      toolCallId: props.tool_call_id,
      type: props.type,
      baseSelector: props.base_selector,
      summaryProps: props.summary_props || {},
      fullProps: props.full_props || {},
    };

    // Use existing extraction logic
    return await this.extractFromCreateAnnotation(annotation);
  }

  /**
   * Get artifact data from map or fetch directly
   */
  private async getArtifactData(
    artifactId: string,
    toolCallId: string,
    artifactMap?: Map<string, any>
  ): Promise<ArtifactData | null> {
    // Use toolCallId for cache key lookup (the unique identifier)
    const key = `${artifactId}:${toolCallId}`;

    // First, check graph session cache for artifacts created in this request
    if (this.streamRequestId) {
      logger.debug({ 
        artifactId, 
        toolCallId, 
        cacheKey: key,
        streamRequestId: this.streamRequestId 
      }, 'Checking graph session cache for artifact');
      
      const cachedArtifact = await graphSessionManager.getArtifactCache(this.streamRequestId, key);
      if (cachedArtifact) {
        logger.debug({ artifactId, toolCallId }, 'Found artifact in graph session cache');
        return this.formatArtifactData(cachedArtifact, artifactId, toolCallId);
      } else {
        logger.debug({ 
          artifactId, 
          toolCallId, 
          cacheKey: key,
          streamRequestId: this.streamRequestId 
        }, 'Artifact NOT found in graph session cache');
      }
    } else {
      logger.warn({ artifactId, toolCallId }, 'No streamRequestId available for cache lookup');
    }

    // Try local cache
    if (this.createdArtifacts.has(key)) {
      const cached = this.createdArtifacts.get(key)!;
      return this.formatArtifactData(cached, artifactId, toolCallId);
    }

    // Try provided artifact map
    if (artifactMap?.has(key)) {
      const artifact = artifactMap.get(key);
      return this.formatArtifactData(artifact, artifactId, toolCallId);
    }

    // Fetch directly from database using taskId and artifactId
    try {
      if (!this.projectId || !this.taskId) {
        logger.warn({ artifactId, toolCallId }, 'No projectId or taskId available for artifact lookup');
        return null;
      }

      const artifacts = await getLedgerArtifacts(dbClient)({
        scopes: { tenantId: this.tenantId, projectId: this.projectId },
        artifactId,
        taskId: this.taskId,
      });

      if (artifacts.length > 0) {
        return this.formatArtifactData(artifacts[0], artifactId, toolCallId);
      }
    } catch (error) {
      logger.warn({ artifactId, toolCallId, taskId: this.taskId, error }, 'Failed to fetch artifact');
    }

    return null;
  }

}

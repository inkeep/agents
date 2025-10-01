import { ArtifactComponentApiInsert } from '@inkeep/agents-core';
import { getLogger } from '../logger';
import { ArtifactService, ArtifactData, ArtifactCreateRequest, ArtifactServiceContext } from './ArtifactService';

const logger = getLogger('ArtifactParser');

// Common types
export interface StreamPart {
  kind: 'text' | 'data';
  text?: string;
  data?: any;
}

// Re-export from service for backward compatibility
export type { ArtifactData } from './ArtifactService';

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
 * Artifact parser focused on parsing and text processing responsibilities
 * Delegates business logic operations to ArtifactService
 * Handles artifact tag detection, parsing, and text boundary detection
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

  private artifactService: ArtifactService;

  constructor(
    tenantId: string,
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
    // Create new ArtifactService instance
    const context: ArtifactServiceContext = {
      tenantId,
      ...options
    };
    this.artifactService = new ArtifactService(context);
  }

  /**
   * Check if text contains complete artifact markers (ref or create)
   */
  hasArtifactMarkers(text: string): boolean {
    const refMatch = ArtifactParser.ARTIFACT_CHECK_REGEX.test(text);
    
    // Use a fresh regex instance to avoid state issues
    const createRegex = /<artifact:create\s+([^>]+?)(?:\s*\/)?>(?:(.*?)<\/artifact:create>)?/gs;
    const createMatch = createRegex.test(text);
    
    return refMatch || createMatch;
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
   * Get all artifacts for a context - delegates to service
   */
  async getContextArtifacts(contextId: string): Promise<Map<string, any>> {
    return this.artifactService.getContextArtifacts(contextId);
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
    
    // Create a fresh regex instance to avoid state issues
    const createRegex = /<artifact:create\s+([^>]+?)(?:\s*\/)?>(?:(.*?)<\/artifact:create>)?/gs;
    
    const matches = [...text.matchAll(createRegex)];

    for (const match of matches) {
      const [fullMatch, attributes] = match;
      const annotation = this.parseCreateAttributes(attributes);
      if (annotation) {
        annotation.raw = fullMatch;
        annotations.push(annotation);
      }
    }

    return annotations;
  }

  /**
   * Extract artifact data from a create annotation - delegates to service
   */
  private async extractFromCreateAnnotation(
    annotation: ArtifactCreateAnnotation,
    agentId?: string
  ): Promise<ArtifactData | null> {
    const request: ArtifactCreateRequest = {
      artifactId: annotation.artifactId,
      toolCallId: annotation.toolCallId,
      type: annotation.type,
      baseSelector: annotation.baseSelector,
      summaryProps: annotation.summaryProps,
      fullProps: annotation.fullProps,
    };

    return this.artifactService.createArtifact(request, agentId);
  }

  /**
   * Parse text with artifact markers into parts array
   * Handles both artifact:ref and artifact:create tags
   * Can work with or without pre-fetched artifact map
   */
  async parseText(text: string, artifactMap?: Map<string, any>, agentId?: string): Promise<StreamPart[]> {
    // First, process any artifact:create annotations
    let processedText = text;
    const createAnnotations = this.parseCreateAnnotations(text);
    
    
    // Extract artifacts from create annotations and cache them for direct replacement
    const createdArtifactData = new Map<string, ArtifactData>();
    const failedAnnotations: string[] = [];
    
    for (const annotation of createAnnotations) {
      try {
        const artifactData = await this.extractFromCreateAnnotation(annotation, agentId);

        if (artifactData && annotation.raw) {
          // Cache the artifact data for direct replacement
          createdArtifactData.set(annotation.raw, artifactData);
        } else if (annotation.raw) {
          // Track failed annotation for user feedback
          failedAnnotations.push(`Failed to create artifact "${annotation.artifactId}": Missing or invalid data`);
          processedText = processedText.replace(annotation.raw, '');
          logger.warn({ annotation, artifactData }, 'Removed failed artifact:create annotation from output');
        }
      } catch (error) {
        // Track extraction failures for user feedback
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        failedAnnotations.push(`Failed to create artifact "${annotation.artifactId}": ${errorMsg}`);
        
        if (annotation.raw) {
          processedText = processedText.replace(annotation.raw, '');
        }
        logger.error({ annotation, error }, 'Failed to extract artifact from create annotation');
      }
    }
    
    // If there were failures, we should surface them somehow
    if (failedAnnotations.length > 0) {
      logger.warn({ 
        failedCount: failedAnnotations.length,
        failures: failedAnnotations 
      }, 'Some artifact creation attempts failed');
    }

    // Parse text for both artifact:create and artifact:ref tags
    const parts: StreamPart[] = [];
    
    // Use fresh regex instances to avoid state issues
    const createRegex = /<artifact:create\s+([^>]+?)(?:\s*\/)?>(?:(.*?)<\/artifact:create>)?/gs;
    const refRegex = /<artifact:ref\s+id=(["'])([^"']*?)\1\s+tool=(["'])([^"']*?)\3\s*\/>/gs;
    
    // First handle direct artifact:create replacements
    const createMatches = [...text.matchAll(createRegex)];
    const refMatches = [...processedText.matchAll(refRegex)];
    
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
        artifactData = await this.getArtifactData(artifactId, toolCallId, artifactMap);
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
  async parseObject(obj: any, artifactMap?: Map<string, any>, agentId?: string): Promise<StreamPart[]> {
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
          const createData = await this.extractFromArtifactCreateComponent(component, agentId);
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
      const createData = await this.extractFromArtifactCreateComponent(obj, agentId);
      return createData ? [{ kind: 'data', data: createData }] : [];
    }

    return [{ kind: 'data', data: obj }];
  }

  /**
   * Check if object is an artifact component
   */
  private isArtifactComponent(obj: any): boolean {
    return obj?.name === 'Artifact' && obj?.props?.artifact_id && obj?.props?.tool_call_id;
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
  private async extractFromArtifactCreateComponent(component: any, agentId?: string): Promise<ArtifactData | null> {
    const props = component.props;
    if (!props) {
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
    return await this.extractFromCreateAnnotation(annotation, agentId);
  }

  /**
   * Get artifact data - delegates to service
   */
  private async getArtifactData(
    artifactId: string,
    toolCallId: string,
    artifactMap?: Map<string, any>
  ): Promise<ArtifactData | null> {
    return this.artifactService.getArtifactData(artifactId, toolCallId, artifactMap);
  }
}
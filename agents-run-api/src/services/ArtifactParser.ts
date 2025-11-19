import type { ArtifactComponentApiInsert, ResolvedRef } from '@inkeep/agents-core';
import { getLogger } from '../logger';
import {
  type ArtifactCreateRequest,
  ArtifactService,
  type ArtifactServiceContext,
  type ArtifactSummaryData,
} from './ArtifactService';

const logger = getLogger('ArtifactParser');

export interface StreamPart {
  kind: 'text' | 'data';
  text?: string;
  data?: any;
}

export type ArtifactData = {
  artifactId: string;
  toolCallId: string;
  name: string;
  description: string;
  type: string;
  summary: Record<string, any>;
};

export type { ArtifactFullData, ArtifactSummaryData } from './ArtifactService';

export interface ArtifactCreateAnnotation {
  artifactId: string;
  toolCallId: string;
  type: string;
  baseSelector: string;
  detailsSelector?: Record<string, string>;
  raw?: string; // Raw annotation text for debugging
}

/**
 * Artifact parser focused on parsing and text processing responsibilities
 * Delegates business logic operations to ArtifactService
 * Handles artifact tag detection, parsing, and text boundary detection
 */
export class ArtifactParser {
  private static readonly ARTIFACT_CHECK_REGEX =
    /<artifact:ref\s+(?=.*id=['"][^'"]+['"])(?=.*tool=['"][^'"]+['"])[^>]*\/>/;
  private static readonly ATTR_REGEX = /(\w+)="([^"]*)"|(\w+)='([^']*)'|(\w+)=({[^}]+})/g;

  private static readonly ARTIFACT_PATTERNS = [
    '<a',
    '<ar',
    '<art',
    '<arti',
    '<artif',
    '<artifa',
    '<artifac',
    '<artifact',
    '<artifact:',
    '<artifact:r',
    '<artifact:re',
    '<artifact:ref',
    '<artifact:c',
    '<artifact:cr',
    '<artifact:cre',
    '<artifact:crea',
    '<artifact:creat',
    '<artifact:create',
  ];
  private static readonly INCOMPLETE_CREATE_REGEX =
    /<artifact:create(?![^>]*(?:\/>|<\/artifact:create>))/;

  private artifactService: ArtifactService;

  constructor(
    tenantId: string,
    ref: ResolvedRef,
    options?: {
      sessionId?: string;
      taskId?: string;
      projectId?: string;
      contextId?: string;
      artifactComponents?: ArtifactComponentApiInsert[];
      streamRequestId?: string;
      subAgentId?: string;
      artifactService?: ArtifactService; // Allow passing existing ArtifactService
    }
  ) {
    if (options?.artifactService) {
      this.artifactService = options.artifactService;
    } else {
      const context: ArtifactServiceContext = {
        tenantId,
        ...options,
      };
      this.artifactService = new ArtifactService(context, ref);
    }
  }

  /**
   * Check if text contains complete artifact markers (ref or create)
   */
  hasArtifactMarkers(text: string): boolean {
    const refMatch = ArtifactParser.ARTIFACT_CHECK_REGEX.test(text);

    const createRegex = /<artifact:create\s+([^>]+?)(?:\s*\/)?>(?:(.*?)<\/artifact:create>)?/gs;
    const createMatch = createRegex.test(text);

    return refMatch || createMatch;
  }

  /**
   * Check if text has incomplete artifact marker (for streaming)
   * More robust detection that handles streaming fragments
   */
  hasIncompleteArtifact(text: string): boolean {
    const endsWithPattern = ArtifactParser.ARTIFACT_PATTERNS.some((pattern) =>
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

    for (const pattern of ArtifactParser.ARTIFACT_PATTERNS) {
      const lastIndex = text.lastIndexOf(pattern);
      if (lastIndex !== -1) {
        const textAfterPattern = text.slice(lastIndex);
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

      if (value?.startsWith('{')) {
        try {
          value = JSON.parse(value);
        } catch {}
      }

      attrs[key] = value;
    }

    if (!attrs.id || !attrs.tool || !attrs.type || !attrs.base) {
      logger.warn({ attrs, attrString }, 'Missing required attributes in artifact annotation');
      return null;
    }

    return {
      artifactId: attrs.id,
      toolCallId: attrs.tool,
      type: attrs.type,
      baseSelector: attrs.base,
      detailsSelector: attrs.details || {},
    };
  }

  /**
   * Parse artifact creation annotations from text
   */
  private parseCreateAnnotations(text: string): ArtifactCreateAnnotation[] {
    const annotations: ArtifactCreateAnnotation[] = [];

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
    subAgentId?: string
  ): Promise<ArtifactSummaryData | null> {
    const request: ArtifactCreateRequest = {
      artifactId: annotation.artifactId,
      toolCallId: annotation.toolCallId,
      type: annotation.type,
      baseSelector: annotation.baseSelector,
      detailsSelector: annotation.detailsSelector,
    };

    return this.artifactService.createArtifact(request, subAgentId);
  }

  /**
   * Parse text with artifact markers into parts array
   * Handles both artifact:ref and artifact:create tags
   * Can work with or without pre-fetched artifact map
   */
  async parseText(
    text: string,
    artifactMap?: Map<string, any>,
    subAgentId?: string
  ): Promise<StreamPart[]> {
    let processedText = text;
    const createAnnotations = this.parseCreateAnnotations(text);

    const createdArtifactData = new Map<string, ArtifactSummaryData>();
    const failedAnnotations: string[] = [];

    for (const annotation of createAnnotations) {
      try {
        const artifactData = await this.extractFromCreateAnnotation(annotation, subAgentId);

        if (artifactData && annotation.raw) {
          createdArtifactData.set(annotation.raw, artifactData);
        } else if (annotation.raw) {
          failedAnnotations.push(
            `Failed to create artifact "${annotation.artifactId}": Missing or invalid data`
          );
          processedText = processedText.replace(annotation.raw, '');
          logger.warn(
            { annotation, artifactData },
            'Removed failed artifact:create annotation from output'
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        failedAnnotations.push(`Failed to create artifact "${annotation.artifactId}": ${errorMsg}`);

        if (annotation.raw) {
          processedText = processedText.replace(annotation.raw, '');
        }
        logger.error({ annotation, error }, 'Failed to extract artifact from create annotation');
      }
    }

    if (failedAnnotations.length > 0) {
      logger.warn(
        {
          failedCount: failedAnnotations.length,
          failures: failedAnnotations,
        },
        'Some artifact creation attempts failed'
      );
    }

    const parts: StreamPart[] = [];

    const createRegex = /<artifact:create\s+([^>]+?)(?:\s*\/)?>(?:(.*?)<\/artifact:create>)?/gs;
    const refRegex = /<artifact:ref\s+id=(["'])([^"']*?)\1\s+tool=(["'])([^"']*?)\3\s*\/>/gs;

    const createMatches = [...text.matchAll(createRegex)];
    const refMatches = [...processedText.matchAll(refRegex)];

    const allMatches: Array<{ match: RegExpMatchArray; type: 'create' | 'ref' }> = [
      ...createMatches.map((match) => ({ match, type: 'create' as const })),
      ...refMatches.map((match) => ({ match, type: 'ref' as const })),
    ].sort((a, b) => (a.match.index || 0) - (b.match.index || 0));

    if (allMatches.length === 0) {
      return [{ kind: 'text', text: processedText }];
    }

    let lastIndex = 0;

    for (const { match, type } of allMatches) {
      if (match.index === undefined) continue;
      const matchStart = match.index;
      const fullMatch = match[0];

      if (matchStart > lastIndex) {
        const textBefore = text.slice(lastIndex, matchStart);
        if (textBefore) {
          parts.push({ kind: 'text', text: textBefore });
        }
      }

      let artifactData: ArtifactSummaryData | null = null;

      if (type === 'create') {
        artifactData = createdArtifactData.get(fullMatch) || null;
      } else {
        const [, , artifactId, , toolCallId] = match;
        artifactData = await this.getArtifactData(artifactId, toolCallId, artifactMap);
      }

      if (artifactData) {
        parts.push({
          kind: 'data',
          data: {
            artifactId: artifactData.artifactId,
            toolCallId: artifactData.toolCallId,
            name: artifactData.name,
            description: artifactData.description,
            type: artifactData.type,
            artifactSummary: artifactData.data,
          },
        });
      }

      lastIndex = matchStart + fullMatch.length;
    }

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
  async parseObject(
    obj: any,
    artifactMap?: Map<string, any>,
    subAgentId?: string
  ): Promise<StreamPart[]> {
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
            parts.push({
              kind: 'data',
              data: {
                artifactId: artifactData.artifactId,
                toolCallId: artifactData.toolCallId,
                name: artifactData.name,
                description: artifactData.description,
                type: artifactData.type,
                artifactSummary: artifactData.data,
              },
            });
          }
        } else if (this.isArtifactCreateComponent(component)) {
          const createData = await this.extractFromArtifactCreateComponent(component, subAgentId);
          if (createData) {
            parts.push({
              kind: 'data',
              data: {
                artifactId: createData.artifactId,
                toolCallId: createData.toolCallId,
                name: createData.name,
                description: createData.description,
                type: createData.type,
                artifactSummary: createData.data,
              },
            });
          }
        } else {
          parts.push({ kind: 'data', data: component });
        }
      }

      return parts;
    }

    if (this.isArtifactComponent(obj)) {
      const artifactData = await this.getArtifactData(
        obj.props.artifact_id,
        obj.props.tool_call_id,
        artifactMap
      );
      return artifactData
        ? [
            {
              kind: 'data',
              data: {
                artifactId: artifactData.artifactId,
                toolCallId: artifactData.toolCallId,
                name: artifactData.name,
                description: artifactData.description,
                type: artifactData.type,
                artifactSummary: artifactData.data,
              },
            },
          ]
        : [];
    }

    if (this.isArtifactCreateComponent(obj)) {
      const createData = await this.extractFromArtifactCreateComponent(obj, subAgentId);
      return createData
        ? [
            {
              kind: 'data',
              data: {
                artifactId: createData.artifactId,
                toolCallId: createData.toolCallId,
                name: createData.name,
                description: createData.description,
                type: createData.type,
                artifactSummary: createData.data,
              },
            },
          ]
        : [];
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
  private async extractFromArtifactCreateComponent(
    component: any,
    subAgentId?: string
  ): Promise<ArtifactSummaryData | null> {
    const props = component.props;
    if (!props) {
      return null;
    }

    const annotation: ArtifactCreateAnnotation = {
      artifactId: props.id,
      toolCallId: props.tool_call_id,
      type: props.type,
      baseSelector: props.base_selector,
      detailsSelector: props.details_selector || {},
    };

    return await this.extractFromCreateAnnotation(annotation, subAgentId);
  }

  /**
   * Get artifact data - delegates to service
   */
  private async getArtifactData(
    artifactId: string,
    toolCallId: string,
    artifactMap?: Map<string, any>
  ): Promise<ArtifactSummaryData | null> {
    return await this.artifactService.getArtifactSummary(artifactId, toolCallId, artifactMap);
  }
}

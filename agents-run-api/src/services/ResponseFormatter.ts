import type { MessageContent } from '@inkeep/agents-core';
import { getLogger } from '../logger';
import { ArtifactParser, type StreamPart } from '../services/ArtifactParser';
import { tracer, setSpanWithError } from '../utils/tracer';
import { graphSessionManager } from '../services/GraphSession';

const logger = getLogger('ResponseFormatter');

/**
 * Response formatter that uses the unified ArtifactParser to convert artifact markers
 * into data parts for consistent artifact handling across all agent responses
 */
export class ResponseFormatter {
  private artifactParser: ArtifactParser;
  private agentId?: string;

  constructor(
    tenantId: string,
    artifactParserOptions?: {
      sessionId?: string;
      taskId?: string;
      projectId?: string;
      contextId?: string;
      artifactComponents?: any[];
      streamRequestId?: string;
      agentId?: string;
    }
  ) {
    // Store agentId for passing to parsing methods
    this.agentId = artifactParserOptions?.agentId;
    
    // Get the shared ArtifactParser from GraphSession
    if (artifactParserOptions?.streamRequestId) {
      const sessionParser = graphSessionManager.getArtifactParser(artifactParserOptions.streamRequestId);
      
      if (sessionParser) {
        this.artifactParser = sessionParser;
        return;
      }
    }
    
    // Fallback: create new parser if session parser not available (for tests, etc.)
    this.artifactParser = new ArtifactParser(tenantId, artifactParserOptions);
  }

  /**
   * Process structured object response and replace artifact markers with actual artifacts
   */
  async formatObjectResponse(responseObject: any, contextId: string): Promise<MessageContent> {
    return tracer.startActiveSpan('response.format_object_response', async (span) => {
      try {
        // Get all artifacts available in this context
        const artifactMap = await this.artifactParser.getContextArtifacts(contextId);

        span.setAttributes({
          'response.type': 'object',
          'response.availableArtifacts': artifactMap.size,
        });

        // Parse the object using unified parser, passing agentId for artifact persistence
        const parts = await this.artifactParser.parseObject(responseObject, artifactMap, this.agentId);

        // Count and log metrics
        const uniqueArtifacts = this.countUniqueArtifacts(parts);
        span.setAttributes({
          'response.dataPartsCount': parts.length,
          'response.artifactsCount': uniqueArtifacts,
          'response.totalPartsCount': parts.length,
        });

        this.logArtifacts(span, parts);

        span.addEvent('response.parts.final_output', {
          final_parts_array: JSON.stringify(parts, null, 2),
        });

        return { parts };
      } catch (error) {
        setSpanWithError(span, error);
        logger.error({ error, responseObject }, 'Error formatting object response');
        return {
          parts: [{ kind: 'data' as const, data: responseObject }],
        };
      } finally {
        span.end();
      }
    });
  }

  /**
   * Process agent response and convert artifact markers to data parts
   */
  async formatResponse(responseText: string, contextId: string): Promise<MessageContent> {
    return tracer.startActiveSpan('response.format_response', async (span) => {
      try {
        const hasMarkers = this.artifactParser.hasArtifactMarkers(responseText);
        span.setAttributes({
          'response.hasArtifactMarkers': hasMarkers,
          'response.contextId': contextId,
          'response.textLength': responseText.length,
        });

        // Check if the response contains artifact markers
        if (!this.artifactParser.hasArtifactMarkers(responseText)) {
          span.setAttributes({
            'response.result': 'no_markers_found',
          });
          return { parts: [{ kind: 'text', text: responseText }] };
        }

        // Get all artifacts available in this context
        const artifactMap = await this.artifactParser.getContextArtifacts(contextId);

        span.setAttributes({
          'response.type': 'text',
          'response.availableArtifacts': artifactMap.size,
        });

        // Parse text using unified parser, passing agentId for artifact persistence
        const parts = await this.artifactParser.parseText(responseText, artifactMap, this.agentId);

        // If only one text part, return as plain text
        if (parts.length === 1 && parts[0].kind === 'text') {
          return { text: parts[0].text };
        }

        // Count and log metrics
        const textParts = parts.filter((p) => p.kind === 'text').length;
        const dataParts = parts.filter((p) => p.kind === 'data').length;
        const uniqueArtifacts = this.countUniqueArtifacts(parts);

        span.setAttributes({
          'response.textPartsCount': textParts,
          'response.dataPartsCount': dataParts,
          'response.artifactsCount': uniqueArtifacts,
          'response.totalPartsCount': parts.length,
        });

        this.logArtifacts(span, parts);

        span.addEvent('response.parts.final_output', {
          final_parts_array: JSON.stringify(parts, null, 2),
        });

        return { parts };
      } catch (error) {
        setSpanWithError(span, error);
        logger.error({ error, responseText }, 'Error formatting response');
        return { text: responseText };
      } finally {
        span.end();
      }
    });
  }

  /**
   * Count unique artifacts in parts array
   */
  private countUniqueArtifacts(parts: StreamPart[]): number {
    const uniqueKeys = new Set(
      parts
        .filter((p) => p.kind === 'data')
        .map((p) => {
          const data = p.data as any;
          if (data?.artifactId && data?.taskId) {
            return `${data.artifactId}:${data.taskId}`;
          }
          return null;
        })
        .filter((key) => key !== null)
    );
    return uniqueKeys.size;
  }

  /**
   * Log artifacts found in parts to span
   */
  private logArtifacts(span: any, parts: StreamPart[]): void {
    const artifacts = parts
      .filter((p) => p.kind === 'data')
      .map((p) => {
        const data = p.data as any;
        return {
          artifactId: data?.artifactId,
          name: data?.name,
          taskId: data?.taskId,
        };
      })
      .filter((art) => art.artifactId && art.taskId);

    if (artifacts.length > 0) {
      const uniqueArtifactsList = Array.from(
        new Map(artifacts.map((art) => [`${art.artifactId}:${art.taskId}`, art])).values()
      );

      span.addEvent('artifacts.found', {
        'artifacts.count': uniqueArtifactsList.length,
        'artifacts.list': JSON.stringify(uniqueArtifactsList),
      });
    }
  }
}

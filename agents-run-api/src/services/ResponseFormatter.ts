import type { MessageContent, ResolvedRef } from '@inkeep/agents-core';
import { getLogger } from '../logger';
import { agentSessionManager } from '../services/AgentSession';
import { ArtifactParser, type StreamPart } from '../services/ArtifactParser';
import { setSpanWithError, tracer } from '../utils/tracer';

const logger = getLogger('ResponseFormatter');

/**
 * Response formatter that uses the unified ArtifactParser to convert artifact markers
 * into data parts for consistent artifact handling across all agent responses
 */
export class ResponseFormatter {
  private artifactParser: ArtifactParser;
  private subAgentId?: string;
  private ref: ResolvedRef;

  constructor(
    tenantId: string,
    ref: ResolvedRef,
    artifactParserOptions?: {
      sessionId?: string;
      taskId?: string;
      projectId?: string;
      contextId?: string;
      artifactComponents?: any[];
      streamRequestId?: string;
      subAgentId?: string;
    }
  ) {
    this.subAgentId = artifactParserOptions?.subAgentId;
    this.ref = ref;

    if (artifactParserOptions?.streamRequestId) {
      const sessionParser = agentSessionManager.getArtifactParser(
        artifactParserOptions.streamRequestId
      );

      if (sessionParser) {
        this.artifactParser = sessionParser;
        return;
      }
    }

    let sharedArtifactService = null;
    if (
      artifactParserOptions?.streamRequestId &&
      typeof agentSessionManager.getArtifactService === 'function'
    ) {
      try {
        sharedArtifactService = agentSessionManager.getArtifactService(
          artifactParserOptions.streamRequestId
        );
      } catch (_error) {}
    }

    this.artifactParser = new ArtifactParser(tenantId, this.ref, {
      ...artifactParserOptions,
      artifactService: sharedArtifactService, // Use shared ArtifactService if available
    });
  }

  /**
   * Process structured object response and replace artifact markers with actual artifacts
   */
  async formatObjectResponse(responseObject: any, contextId: string): Promise<MessageContent> {
    return tracer.startActiveSpan('response.format_object_response', async (span) => {
      try {
        const artifactMap = await this.artifactParser.getContextArtifacts(contextId);

        span.setAttributes({
          'response.type': 'object',
          'response.availableArtifacts': artifactMap.size,
        });

        const parts = await this.artifactParser.parseObject(
          responseObject,
          artifactMap,
          this.subAgentId
        );

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
        setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
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

        if (!this.artifactParser.hasArtifactMarkers(responseText)) {
          span.setAttributes({
            'response.result': 'no_markers_found',
          });
          return { parts: [{ kind: 'text', text: responseText }] };
        }

        const artifactMap = await this.artifactParser.getContextArtifacts(contextId);

        span.setAttributes({
          'response.type': 'text',
          'response.availableArtifacts': artifactMap.size,
        });

        const parts = await this.artifactParser.parseText(
          responseText,
          artifactMap,
          this.subAgentId
        );

        if (parts.length === 1 && parts[0].kind === 'text') {
          return { text: parts[0].text };
        }

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
        setSpanWithError(span, error instanceof Error ? error : new Error(String(error)));
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

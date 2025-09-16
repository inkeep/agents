import { getLedgerArtifacts, getTask, listTaskIdsByContextId } from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('ArtifactParser');

// Common types
export interface StreamPart {
  kind: 'text' | 'data';
  text?: string;
  data?: any;
}

export interface ArtifactData {
  artifactId: string;
  taskId: string;
  name: string;
  description: string;
  artifactType?: string;
  artifactSummary: any;
}

/**
 * Unified artifact parser that handles all artifact-related parsing and formatting
 * Used by both ResponseFormatter and IncrementalStreamParser to eliminate redundancy
 */
export class ArtifactParser {
  // Shared regex patterns
  private static readonly ARTIFACT_REGEX =
    /<artifact:ref\s+id="([^"]*?)"\s+task="([^"]*?)"\s*\/>/gs;
  private static readonly ARTIFACT_CHECK_REGEX =
    /<artifact:ref\s+(?=.*id="[^"]+")(?=.*task="[^"]+")[^>]*\/>/;

  // Regex for catching any partial artifact pattern (< + any prefix of "artifact:ref")
  private static readonly INCOMPLETE_ARTIFACT_REGEX =
    /<(a(r(t(i(f(a(c(t(:?(r(e(f)?)?)?)?)?)?)?)?)?)?)?)?$/g;

  constructor(private tenantId: string) {}

  /**
   * Check if text contains complete artifact markers
   */
  hasArtifactMarkers(text: string): boolean {
    return ArtifactParser.ARTIFACT_CHECK_REGEX.test(text);
  }

  /**
   * Check if text has incomplete artifact marker (for streaming)
   * More robust detection that handles streaming fragments
   */
  hasIncompleteArtifact(text: string): boolean {
    // Check if text ends with any partial artifact pattern
    return (
      /<(a(r(t(i(f(a(c(t(:?(r(e(f)?)?)?)?)?)?)?)?)?)?)?)?$/.test(text) ||
      /<artifact:ref[^>]+$/.test(text) || // Incomplete artifact ref at end
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

      /<(a(r(t(i(f(a(c(t(:?(r(e(f)?)?)?)?)?)?)?)?)?)?)?)?$/, // Any partial artifact pattern at end
    ];

    for (const pattern of endPatterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        return match.index;
      }
    }

    // Look for incomplete artifact patterns anywhere in text
    const matches = [...text.matchAll(ArtifactParser.INCOMPLETE_ARTIFACT_REGEX)];

    if (matches.length === 0) {
      return text.length;
    }

    // Check each match from the end to find an incomplete artifact
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const startIdx = match.index!;
      const textAfterMatch = text.slice(startIdx);

      // If the text after this match doesn't contain a closing '/>', it's incomplete
      if (!textAfterMatch.includes('/>')) {
        return startIdx;
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
          const key = `${artifact.artifactId}:${artifact.taskId}`;
          artifacts.set(key, artifact);
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
  private formatArtifactData(artifact: any, artifactId: string, taskId: string): ArtifactData {
    return {
      artifactId,
      taskId,
      name: artifact.name || 'Processing...',
      description: artifact.description || 'Name and description being generated...',
      artifactType: artifact.metadata?.artifactType,
      artifactSummary: artifact.parts?.[0]?.data?.summary || {},
    };
  }

  /**
   * Parse text with artifact markers into parts array
   * Can work with or without pre-fetched artifact map
   */
  async parseText(text: string, artifactMap?: Map<string, any>): Promise<StreamPart[]> {
    const parts: StreamPart[] = [];
    const matches = [...text.matchAll(ArtifactParser.ARTIFACT_REGEX)];

    if (matches.length === 0) {
      return [{ kind: 'text', text }];
    }

    let lastIndex = 0;

    for (const match of matches) {
      const [fullMatch, artifactId, taskId] = match;
      const matchStart = match.index!;

      // Add text before artifact
      if (matchStart > lastIndex) {
        const textBefore = text.slice(lastIndex, matchStart);
        if (textBefore.trim()) {
          parts.push({ kind: 'text', text: textBefore });
        }
      }

      // Get artifact data
      const artifactData = await this.getArtifactData(artifactId, taskId, artifactMap);
      if (artifactData) {
        parts.push({ kind: 'data', data: artifactData });
      }
      // If no artifact found, marker is simply removed

      lastIndex = matchStart + fullMatch.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      if (remainingText.trim()) {
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
            component.props.task_id,
            artifactMap
          );
          if (artifactData) {
            parts.push({ kind: 'data', data: artifactData });
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
        obj.props.task_id,
        artifactMap
      );
      return artifactData ? [{ kind: 'data', data: artifactData }] : [];
    }

    return [{ kind: 'data', data: obj }];
  }

  /**
   * Check if object is an artifact component
   */
  private isArtifactComponent(obj: any): boolean {
    return obj?.props?.artifact_id && obj?.props?.task_id;
  }

  /**
   * Get artifact data from map or fetch directly
   */
  private async getArtifactData(
    artifactId: string,
    taskId: string,
    artifactMap?: Map<string, any>
  ): Promise<ArtifactData | null> {
    const key = `${artifactId}:${taskId}`;

    // Try map first
    if (artifactMap?.has(key)) {
      const artifact = artifactMap.get(key);
      return this.formatArtifactData(artifact, artifactId, taskId);
    }

    // Fetch directly if no map
    try {
      // Get task to retrieve projectId
      const task = await getTask(dbClient)({
        id: taskId,
      });
      if (!task) {
        logger.warn({ taskId }, 'Task not found when fetching artifact');
        return null;
      }

      const artifacts = await getLedgerArtifacts(dbClient)({
        scopes: { tenantId: this.tenantId, projectId: task.projectId },
        artifactId,
        taskId,
      });

      if (artifacts.length > 0) {
        return this.formatArtifactData(artifacts[0], artifactId, taskId);
      }
    } catch (error) {
      logger.warn({ artifactId, taskId, error }, 'Failed to fetch artifact');
    }

    return null;
  }

  /**
   * Parse partial JSON buffer (for streaming)
   */
  parsePartialJSON(buffer: string): { complete: any[]; remaining: string } {
    const complete: any[] = [];
    let remaining = buffer;
    let braceCount = 0;
    let start = -1;

    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === '{') {
        if (braceCount === 0) start = i;
        braceCount++;
      } else if (buffer[i] === '}') {
        braceCount--;
        if (braceCount === 0 && start !== -1) {
          const jsonStr = buffer.slice(start, i + 1);
          try {
            complete.push(JSON.parse(jsonStr));
            remaining = buffer.slice(i + 1);
            start = -1;
          } catch {
            // Invalid JSON, continue
          }
        }
      }
    }

    return { complete, remaining };
  }
}

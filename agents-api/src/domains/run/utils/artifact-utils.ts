import { getLogger } from '../../../logger';
import { estimateTokens } from './token-estimator';

const logger = getLogger('artifact-utils');

/**
 * Artifact metadata returned from saveToolResultsAsArtifacts
 */
export interface ArtifactInfo {
  artifactId: string;
  isOversized: boolean;
  originalTokenSize?: number;
  contextWindowSize?: number;
  toolArgs?: Record<string, unknown>;
  structureInfo?: string;
  oversizedWarning?: string;
}

/**
 * Generate human-readable structure information for data
 */
export function generateStructureInfo(data: any): string {
  try {
    if (Array.isArray(data)) {
      return `Array with ${data.length} items`;
    }
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      return `Object with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', ...' : ''}`;
    }
    if (typeof data === 'string') {
      const lines = data.split('\n').length;
      const chars = data.length;
      return `String: ${chars} characters, ${lines} lines`;
    }
    return `${typeof data} value`;
  } catch {
    return 'Unknown structure';
  }
}

export interface OversizedDetectionResult {
  isOversized: boolean;
  originalTokenSize: number;
  contextWindowSize?: number;
  retrievalBlocked: boolean;
  oversizedWarning?: string;
  structureInfo?: string;
}

/**
 * Detect if artifact data is oversized (>30% of context window)
 * Returns metadata for artifact saving
 */
export function detectOversizedArtifact(
  data: any,
  contextWindowSize?: number,
  context?: {
    artifactId?: string;
    toolCallId?: string;
    toolName?: string;
  }
): OversizedDetectionResult {
  const result: OversizedDetectionResult = {
    isOversized: false,
    originalTokenSize: 0,
    contextWindowSize: contextWindowSize,
    retrievalBlocked: false,
  };

  if (!contextWindowSize) {
    return result;
  }

  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  result.originalTokenSize = estimateTokens(dataString);
  const maxSafeSize = Math.floor(contextWindowSize * 0.3); // 30% threshold
  result.isOversized = result.originalTokenSize > maxSafeSize;
  result.retrievalBlocked = result.isOversized;

  if (result.isOversized) {
    logger.warn(
      {
        ...context,
        tokenSize: result.originalTokenSize,
        maxSafeSize,
        contextWindowSize,
      },
      'Artifact data exceeds safe context size - marking as oversized'
    );

    result.oversizedWarning = `⚠️ OVERSIZED: Result is ~${Math.floor(result.originalTokenSize / 1000)}K tokens, exceeds safe context limits. Full data saved but cannot be retrieved.`;
    result.structureInfo = generateStructureInfo(data);
  }

  return result;
}

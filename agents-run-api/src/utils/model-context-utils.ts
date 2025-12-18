import type { ModelSettings } from '@inkeep/agents-core';
import { ModelInfoMap } from 'llm-info';
import { getLogger } from '../logger';

const logger = getLogger('ModelContextUtils');

/**
 * Get context window information for a model
 */
export interface ModelContextInfo {
  contextWindow: number | null;
  hasValidContextWindow: boolean;
  modelId: string;
  source: 'llm-info' | 'fallback';
}

/**
 * Extract model ID from model settings for llm-info lookup
 */
function extractModelIdForLlmInfo(modelSettings?: ModelSettings): string | null {
  if (!modelSettings?.model) return null;

  const modelString = modelSettings.model.trim();

  // Remove provider prefix for llm-info lookup
  // Examples: "google/gemini-3-flash-preview" -> "gemini-3-flash-preview"
  //           "anthropic/claude-sonnet-4" -> "claude-sonnet-4"
  //           "openai/gpt-4.1" -> "gpt-4.1"

  if (modelString.includes('/')) {
    const parts = modelString.split('/');
    return parts.slice(1).join('/'); // Everything after the first slash
  }

  return modelString;
}

/**
 * Get context window size for a model using llm-info
 * Falls back to default values if model not found
 */
export function getModelContextWindow(modelSettings?: ModelSettings): ModelContextInfo {
  const defaultContextWindow = 120000; // Current fallback default

  if (!modelSettings?.model) {
    logger.debug({}, 'No model settings provided, using fallback');
    return {
      contextWindow: defaultContextWindow,
      hasValidContextWindow: false,
      modelId: 'unknown',
      source: 'fallback',
    };
  }

  const modelId = extractModelIdForLlmInfo(modelSettings);
  if (!modelId) {
    logger.debug(
      { modelString: modelSettings.model },
      'Could not extract model ID for llm-info lookup'
    );
    return {
      contextWindow: defaultContextWindow,
      hasValidContextWindow: false,
      modelId: modelSettings.model,
      source: 'fallback',
    };
  }

  try {
    const modelDetails = ModelInfoMap[modelId as keyof typeof ModelInfoMap];

    if (
      modelDetails &&
      modelDetails.contextWindowTokenLimit &&
      modelDetails.contextWindowTokenLimit > 0
    ) {
      logger.debug(
        {
          modelId,
          contextWindow: modelDetails.contextWindowTokenLimit,
          originalModel: modelSettings.model,
        },
        'Found context window from llm-info'
      );

      return {
        contextWindow: modelDetails.contextWindowTokenLimit,
        hasValidContextWindow: true,
        modelId,
        source: 'llm-info',
      };
    } else {
      logger.debug(
        {
          modelId,
          modelDetails,
          originalModel: modelSettings.model,
        },
        'No valid context window found in llm-info'
      );
    }
  } catch (error) {
    logger.debug(
      {
        modelId,
        error: error instanceof Error ? error.message : String(error),
        originalModel: modelSettings.model,
      },
      'Error getting model details from llm-info'
    );
  }

  // Fallback to default
  logger.debug({ modelId, defaultContextWindow }, 'Using fallback context window');
  return {
    contextWindow: defaultContextWindow,
    hasValidContextWindow: false,
    modelId,
    source: 'fallback',
  };
}

/**
 * Get compression configuration based on model context window
 * Uses actual model context window when available, otherwise falls back to environment variables
 */
export function getCompressionConfigForModel(modelSettings?: ModelSettings): {
  hardLimit: number;
  safetyBuffer: number;
  enabled: boolean;
  source: string;
  modelContextInfo: ModelContextInfo;
} {
  const modelContextInfo = getModelContextWindow(modelSettings);

  // Default values from environment or fallback
  const envHardLimit = parseInt(process.env.AGENTS_COMPRESSION_HARD_LIMIT || '120000');
  const envSafetyBuffer = parseInt(process.env.AGENTS_COMPRESSION_SAFETY_BUFFER || '20000');
  const enabled = process.env.AGENTS_COMPRESSION_ENABLED !== 'false';

  if (modelContextInfo.hasValidContextWindow && modelContextInfo.contextWindow) {
    // Calculate compression thresholds based on actual context window
    // Use a percentage-based approach: start compressing at 80% of context window
    const compressionThreshold = 0.8;
    const hardLimit = Math.floor(modelContextInfo.contextWindow * compressionThreshold);
    const safetyBuffer = Math.floor(modelContextInfo.contextWindow * 0.15); // 15% safety buffer

    logger.info(
      {
        modelId: modelContextInfo.modelId,
        contextWindow: modelContextInfo.contextWindow,
        hardLimit,
        safetyBuffer,
        threshold: compressionThreshold,
      },
      'Using model-specific compression configuration'
    );

    return {
      hardLimit,
      safetyBuffer,
      enabled,
      source: 'model-specific',
      modelContextInfo,
    };
  } else {
    // Use environment variables or defaults
    const source = process.env.AGENTS_COMPRESSION_HARD_LIMIT ? 'environment' : 'default';

    logger.debug(
      {
        modelId: modelContextInfo.modelId,
        hardLimit: envHardLimit,
        safetyBuffer: envSafetyBuffer,
        source,
      },
      'Using fallback compression configuration'
    );

    return {
      hardLimit: envHardLimit,
      safetyBuffer: envSafetyBuffer,
      enabled,
      source,
      modelContextInfo,
    };
  }
}

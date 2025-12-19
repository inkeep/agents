import type { ModelSettings } from '@inkeep/agents-core';
import { ModelInfoMap } from 'llm-info';
import { getLogger } from '../logger';
import { COMPRESSION_HARD_LIMIT, COMPRESSION_SAFETY_BUFFER, COMPRESSION_ENABLED } from '../constants/execution-limits';

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

  // Get the last part after the final slash
  // Examples: "google/gemini-3-flash-preview" -> "gemini-3-flash-preview"
  //           "provider/sub/model-name" -> "model-name"
  //           "openai/gpt-4.1" -> "gpt-4.1"

  if (modelString.includes('/')) {
    const parts = modelString.split('/');
    return parts[parts.length - 1];
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
 * Get model-size aware compression parameters
 * Uses aggressive thresholds for better utilization, especially on large models
 */
function getCompressionParams(contextWindow: number): { threshold: number; bufferPct: number } {
  if (contextWindow < 100000) {
    // Small models (< 100K): Aggressive but safe
    return { threshold: 0.85, bufferPct: 0.1 }; // 75% trigger point
  } else if (contextWindow < 500000) {
    // Medium models (100K - 500K): Very aggressive
    return { threshold: 0.9, bufferPct: 0.07 }; // 83% trigger point
  } else {
    // Large models (> 500K): Extremely aggressive utilization
    return { threshold: 0.95, bufferPct: 0.04 }; // 91% trigger point
  }
}

/**
 * Get compression configuration based on model context window
 * Uses actual model context window when available, otherwise falls back to environment variables
 * @param modelSettings - Model settings to get context window for
 * @param targetPercentage - Target percentage of context window to use (e.g., 0.5 for conversation, undefined for model-aware defaults)
 */
export function getCompressionConfigForModel(
  modelSettings?: ModelSettings,
  targetPercentage?: number
): {
  hardLimit: number;
  safetyBuffer: number;
  enabled: boolean;
  source: string;
  modelContextInfo: ModelContextInfo;
} {
  const modelContextInfo = getModelContextWindow(modelSettings);

  // Default values from environment or fallback
  const envHardLimit = parseInt(process.env.AGENTS_COMPRESSION_HARD_LIMIT || COMPRESSION_HARD_LIMIT.toString());
  const envSafetyBuffer = parseInt(process.env.AGENTS_COMPRESSION_SAFETY_BUFFER || COMPRESSION_SAFETY_BUFFER.toString());
  const enabled = process.env.AGENTS_COMPRESSION_ENABLED !== 'false' && COMPRESSION_ENABLED;

  if (modelContextInfo.hasValidContextWindow && modelContextInfo.contextWindow) {
    let hardLimit: number;
    let safetyBuffer: number;
    let logContext: any;

    if (targetPercentage !== undefined) {
      // Use specified percentage (e.g., 0.5 for conversation compression)
      hardLimit = Math.floor(modelContextInfo.contextWindow * targetPercentage);
      safetyBuffer = Math.floor(modelContextInfo.contextWindow * 0.05); // Fixed 5% safety buffer
      const triggerPoint = hardLimit - safetyBuffer;
      const triggerPercentage = ((triggerPoint / modelContextInfo.contextWindow) * 100).toFixed(1);
      
      logContext = {
        modelId: modelContextInfo.modelId,
        contextWindow: modelContextInfo.contextWindow,
        hardLimit,
        safetyBuffer,
        triggerPoint,
        triggerPercentage: `${triggerPercentage}%`,
        targetPercentage: `${(targetPercentage * 100).toFixed(1)}%`,
        compressionType: targetPercentage <= 0.6 ? 'conversation' : 'mid-generation',
      };
      
      logger.info(logContext, 'Using percentage-based compression configuration');
    } else {
      // Use model-size aware compression parameters (original aggressive logic)
      const params = getCompressionParams(modelContextInfo.contextWindow);
      hardLimit = Math.floor(modelContextInfo.contextWindow * params.threshold);
      safetyBuffer = Math.floor(modelContextInfo.contextWindow * params.bufferPct);
      const triggerPoint = hardLimit - safetyBuffer;
      const triggerPercentage = ((triggerPoint / modelContextInfo.contextWindow) * 100).toFixed(1);

      logContext = {
        modelId: modelContextInfo.modelId,
        contextWindow: modelContextInfo.contextWindow,
        hardLimit,
        safetyBuffer,
        triggerPoint,
        triggerPercentage: `${triggerPercentage}%`,
        threshold: params.threshold,
        bufferPct: params.bufferPct,
      };
      
      logger.info(logContext, 'Using model-size aware compression configuration');
    }

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

import { ModelFactory, type ModelSettings } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import {
  AGENT_EXECUTION_MAX_GENERATION_STEPS,
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING,
  LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,
} from '../../constants/execution-limits';
import type { AgentConfig, AgentRunContext } from '../agent-types';
import { validateModel } from '../agent-types';

const logger = getLogger('Agent');

export function getMaxGenerationSteps(config: AgentConfig): number {
  return config.stopWhen?.stepCountIs ?? AGENT_EXECUTION_MAX_GENERATION_STEPS;
}

export function getPrimaryModel(config: AgentConfig): ModelSettings {
  if (!config.models?.base) {
    throw new Error(
      'Base model configuration is required. Please configure models at the project level.'
    );
  }
  return {
    model: validateModel(config.models.base.model, 'Base'),
    providerOptions: config.models.base.providerOptions,
  };
}

export function getStructuredOutputModel(config: AgentConfig): ModelSettings {
  if (!config.models) {
    throw new Error(
      'Model configuration is required. Please configure models at the project level.'
    );
  }

  const structuredConfig = config.models.structuredOutput;
  const baseConfig = config.models.base;

  if (structuredConfig) {
    return {
      model: validateModel(structuredConfig.model, 'Structured output'),
      providerOptions: structuredConfig.providerOptions,
    };
  }

  if (!baseConfig) {
    throw new Error(
      'Base model configuration is required for structured output fallback. Please configure models at the project level.'
    );
  }
  return {
    model: validateModel(baseConfig.model, 'Base (fallback for structured output)'),
    providerOptions: baseConfig.providerOptions,
  };
}

export function getSummarizerModel(config: AgentConfig): ModelSettings {
  if (!config.models) {
    throw new Error(
      'Model configuration is required. Please configure models at the project level.'
    );
  }

  const summarizerConfig = config.models.summarizer;
  const baseConfig = config.models.base;

  if (summarizerConfig) {
    return {
      model: validateModel(summarizerConfig.model, 'Summarizer'),
      providerOptions: summarizerConfig.providerOptions,
    };
  }

  if (!baseConfig) {
    throw new Error(
      'Base model configuration is required for summarizer fallback. Please configure models at the project level.'
    );
  }
  return {
    model: validateModel(baseConfig.model, 'Base (fallback for summarizer)'),
    providerOptions: baseConfig.providerOptions,
  };
}

export function configureModelSettings(ctx: AgentRunContext): {
  primaryModelSettings: ModelSettings;
  modelSettings: any;
  hasStructuredOutput: boolean;
  timeoutMs: number;
} {
  const hasStructuredOutput = Boolean(
    ctx.config.dataComponents && ctx.config.dataComponents.length > 0
  );

  const primaryModelSettings = hasStructuredOutput
    ? getStructuredOutputModel(ctx.config)
    : getPrimaryModel(ctx.config);
  const modelSettings = ModelFactory.prepareGenerationConfig(primaryModelSettings);

  const configuredTimeout = modelSettings.maxDuration
    ? Math.min(modelSettings.maxDuration * 1000, LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS)
    : LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING;

  const timeoutMs = Math.min(configuredTimeout, LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS);

  if (
    modelSettings.maxDuration &&
    modelSettings.maxDuration * 1000 > LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS
  ) {
    logger.warn(
      {
        requestedTimeout: modelSettings.maxDuration * 1000,
        appliedTimeout: timeoutMs,
        maxAllowed: LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,
      },
      'Requested timeout exceeded maximum allowed, capping to 10 minutes'
    );
  }

  return {
    primaryModelSettings,
    modelSettings: { ...modelSettings, maxDuration: timeoutMs / 1000 },
    hasStructuredOutput,
    timeoutMs,
  };
}

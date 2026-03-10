import type { ModelSettings } from '@inkeep/agents-core';
import { ModelFactory } from '@inkeep/agents-core';
import { generateText, Output } from 'ai';
import type { z } from 'zod';
import { getLogger } from '../../../logger';
import { LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS } from '../constants/execution-limits';
import { getModelContextWindow } from '../utils/model-context-utils';
import { estimateTokens } from '../utils/token-estimator';

const logger = getLogger('distill-utils');

export async function distillWithTruncation<TSchema extends z.ZodType>(opts: {
  conversationId: string;
  summarizerModel: ModelSettings | undefined;
  schema: TSchema;
  buildPrompt: (formattedMessages: string) => string;
  messageFormatter: (maxChars?: number) => string;
}): Promise<z.infer<TSchema>> {
  const { conversationId, summarizerModel, schema, buildPrompt, messageFormatter } = opts;

  if (!summarizerModel?.model?.trim()) {
    throw new Error('Summarizer model is required');
  }

  const modelContextInfo = getModelContextWindow(summarizerModel);
  if (!modelContextInfo.contextWindow) {
    throw new Error('Could not determine model context window for distillation');
  }
  const { contextWindow } = modelContextInfo;
  const safeLimit = Math.floor(contextWindow * 0.8);
  const generationConfig = ModelFactory.prepareGenerationConfig(summarizerModel);

  logger.info(
    { conversationId, contextWindow, safeLimit, modelId: modelContextInfo.modelId },
    'Starting distillation with context window limits'
  );

  const attempts = [
    { name: 'no_truncation', maxChars: undefined as number | undefined },
    { name: 'moderate', maxChars: Math.floor(safeLimit * 4) },
    { name: 'aggressive', maxChars: Math.floor(safeLimit * 2) },
  ];

  for (const { name, maxChars } of attempts) {
    const prompt = buildPrompt(messageFormatter(maxChars));
    const estimatedTokens = estimateTokens(prompt);

    if (estimatedTokens > safeLimit) {
      logger.info(
        { conversationId, attempt: name, estimatedTokens, safeLimit },
        'Prompt exceeds safe limit, trying more aggressive truncation'
      );
      continue;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn(
        { conversationId, attempt: name, timeoutMs: LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS },
        'Distillation LLM call timed out, aborting'
      );
      controller.abort();
    }, LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS);
    try {
      const result = await generateText({
        ...generationConfig,
        prompt,
        output: Output.object({ schema }),
        abortSignal: controller.signal,
      });
      return result.output as unknown as z.infer<TSchema>;
    } catch (llmError) {
      const message = llmError instanceof Error ? llmError.message : String(llmError);
      if (
        message.includes('too long') ||
        message.includes('token') ||
        message.includes('context length') ||
        message.includes('max_tokens') ||
        message.includes('context_length_exceeded')
      ) {
        logger.info(
          { conversationId, attempt: name, error: message },
          'LLM rejected prompt as too long, trying more aggressive truncation'
        );
        continue;
      }
      throw llmError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(
    `Failed to distill: all truncation attempts exceeded safe limit (context window: ${contextWindow}, safe limit: ${safeLimit})`
  );
}

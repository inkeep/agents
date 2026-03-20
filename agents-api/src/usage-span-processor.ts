import { getPricingService } from '@inkeep/agents-core';
import type { Context, Span } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

const AI_OPERATION_PREFIXES = ['ai.generateText.doGenerate', 'ai.streamText.doStream'];

function isAiGenerationSpan(spanName: string): boolean {
  return AI_OPERATION_PREFIXES.some((prefix) => spanName.startsWith(prefix));
}

export class UsageCostSpanProcessor implements SpanProcessor {
  onStart(_span: Span, _parentContext: Context): void {}

  onEnd(span: ReadableSpan): void {
    if (!isAiGenerationSpan(span.name)) return;

    const attrs = span.attributes;
    const inputTokens = attrs['gen_ai.usage.input_tokens'];
    const outputTokens = attrs['gen_ai.usage.output_tokens'];

    if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return;

    const modelId =
      (attrs['ai.model.id'] as string) ??
      (attrs['gen_ai.response.model'] as string) ??
      (attrs['gen_ai.request.model'] as string);

    if (!modelId) return;

    const providerRaw = (attrs['ai.model.provider'] as string) ?? '';
    const provider = providerRaw.split('.')[0] || 'unknown';

    const pricingService = getPricingService();
    const pricing = pricingService.getModelPricing(modelId, provider);

    const mutableAttrs = attrs as Record<string, unknown>;
    mutableAttrs['gen_ai.usage.total_tokens'] = inputTokens + outputTokens;

    if (pricing) {
      const cost = pricingService.calculateCost({ inputTokens, outputTokens }, pricing);
      mutableAttrs['gen_ai.cost.estimated_usd'] = cost;
    }
  }

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

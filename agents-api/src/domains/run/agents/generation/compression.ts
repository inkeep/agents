import { MidGenerationCompressor } from '../../compression/MidGenerationCompressor';
import { getCompressionConfigForModel } from '../../utils/model-context-utils';
import type { AgentRunContext } from '../agent-types';
import { getSummarizerModel } from './model-config';

export function setupCompression(
  ctx: AgentRunContext,
  messages: any[],
  sessionId: string,
  contextId: string,
  primaryModelSettings: any
): { originalMessageCount: number; compressor: MidGenerationCompressor | null } {
  const originalMessageCount = messages.length;
  const compressionConfigResult = getCompressionConfigForModel(primaryModelSettings);
  const compressionConfig = {
    hardLimit: compressionConfigResult.hardLimit,
    safetyBuffer: compressionConfigResult.safetyBuffer,
    enabled: compressionConfigResult.enabled,
  };
  const compressor = compressionConfig.enabled
    ? new MidGenerationCompressor(
        sessionId,
        contextId,
        ctx.config.tenantId,
        ctx.config.projectId,
        compressionConfig,
        getSummarizerModel(ctx.config),
        primaryModelSettings
      )
    : null;

  ctx.currentCompressor = compressor;

  return { originalMessageCount, compressor };
}

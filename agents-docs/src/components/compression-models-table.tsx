import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  OPENAI_MODELS,
} from '@inkeep/agents-core/constants/models';
import { ModelInfoMap } from 'llm-info';
import { extractModelIdForLlmInfo } from '../../../agents-run-api/src/utils/model-context-utils';

// Select representative models from our supported set
const FEATURED_MODELS = [
  OPENAI_MODELS.GPT_5_2,
  ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  GOOGLE_MODELS.GEMINI_3_PRO_PREVIEW,
] as const;

// Same compression logic as the runtime
function getCompressionParams(contextWindow: number) {
  if (contextWindow < 100000) {
    return { threshold: 0.85, bufferPct: 0.1 }; // 75% trigger point
  }
  if (contextWindow < 500000) {
    return { threshold: 0.9, bufferPct: 0.07 }; // 83% trigger point
  }
  return { threshold: 0.91, bufferPct: 0.05 }; // 86% trigger point
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1).replace('.0', '')}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return tokens.toString();
}


export function CompressionModelsTable() {
  const rows = FEATURED_MODELS
    .map((modelString) => {
      const modelId = extractModelIdForLlmInfo(modelString);
      const modelDetails = ModelInfoMap[modelId as keyof typeof ModelInfoMap];

      // Only use models that exist in llm-info
      if (!modelDetails?.contextWindowTokenLimit) {
        return null;
      }

      const contextWindow = modelDetails.contextWindowTokenLimit;
      const conversationThreshold = Math.floor(contextWindow * 0.5);
      const params = getCompressionParams(contextWindow);
      const contextCompactingThreshold = Math.floor(contextWindow * params.threshold);
      const contextCompactingPct = Math.round(params.threshold * 100);

      return {
        model: modelString,
        contextWindow,
        conversationThreshold,
        contextCompactingThreshold,
        contextCompactingPct,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto">
        <thead>
          <tr>
            <th>Model</th>
            <th>Context Window</th>
            <th>Conversation Threshold</th>
            <th>Context Compacting Threshold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model}>
              <td>{row.model}</td>
              <td>{formatTokens(row.contextWindow)} tokens</td>
              <td>{formatTokens(row.conversationThreshold)} (50%)</td>
              <td>
                ~{formatTokens(row.contextCompactingThreshold)} ({row.contextCompactingPct}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

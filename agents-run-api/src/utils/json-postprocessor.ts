/**
 * Simple post-processor to clean up common LLM JSON formatting issues
 */
export function stripJsonCodeBlocks(text: string): string {
  return text
    .trim()
    // Remove ```json and ``` blocks
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Configuration helper to add JSON post-processing to generateObject calls
 */
export function withJsonPostProcessing<T extends Record<string, any>>(config: T): T & {
  experimental_transform?: (text: string) => string;
} {
  return {
    ...config,
    experimental_transform: (text: string) => stripJsonCodeBlocks(text),
  };
}
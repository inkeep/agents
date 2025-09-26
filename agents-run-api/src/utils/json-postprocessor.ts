/**
 * Simple post-processor to clean up common LLM JSON formatting issues
 */
export function stripJsonCodeBlocks(text: string): string {
  return text
    .trim()
    // Remove ```json and ``` blocks - handle multiline with dotall flag
    .replace(/^```json\s*/is, '')
    .replace(/^```\s*/s, '')
    .replace(/\s*```$/s, '')
    // Also handle cases where the entire response is wrapped
    .replace(/^```json\s*([\s\S]*?)\s*```$/i, '$1')
    .replace(/^```\s*([\s\S]*?)\s*```$/i, '$1')
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
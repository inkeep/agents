/**
 * XML tag names used in LLM responses for artifact operations.
 */
export const ARTIFACT_TAG = {
  CREATE: 'artifact:create',
  REF: 'artifact:ref',
} as const;

/**
 * Sentinel object keys used in tool arguments for reference resolution.
 */
export const SENTINEL_KEY = {
  ARTIFACT: '$artifact',
  TOOL: '$tool',
} as const;

/**
 * Built-in tool names for artifact operations.
 */
export const ARTIFACT_TOOL = {
  GET_REFERENCE: 'get_reference_artifact',
} as const;

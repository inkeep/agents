/**
 * Model provider options templates
 * Used in agent metadata editor, project forms, evaluations, etc.
 */

export const providerOptionsTemplate = `{
  "temperature": 0.7,
  "maxTokens": 2048
}`;

export const structuredOutputModelProviderOptionsTemplate = `{
  "temperature": 0.1,
  "maxOutputTokens": 1024
}`;

export const summarizerModelProviderOptionsTemplate = `{
  "temperature": 0.3,
  "maxOutputTokens": 1024
}`;

export const azureModelProviderOptionsTemplate = `{
  "temperature": 0.7,
  "maxOutputTokens": 2048
}`;

export const azureModelSummarizerProviderOptionsTemplate = `{
  "temperature": 0.3,
  "maxOutputTokens": 1024
}`;

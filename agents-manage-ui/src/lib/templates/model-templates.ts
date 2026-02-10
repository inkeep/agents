/**
 * Model provider options templates
 * Used in agent metadata editor, project forms, evaluations, etc.
 */

export const providerOptionsTemplate = `{
  "temperature": 0.7,
  "maxTokens": 2048
}`;

export const summarizerModelProviderOptionsTemplate = `{
  "temperature": 0.3,
  "maxOutputTokens": 1024
}`;

export const azureModelProviderOptionsTemplate = `{
  "resourceName": "your-azure-resource",
  "temperature": 0.7,
  "maxOutputTokens": 2048
}`;

export const azureModelSummarizerProviderOptionsTemplate = `{
  "resourceName": "your-azure-resource",
  "temperature": 0.3,
  "maxOutputTokens": 1024
}`;

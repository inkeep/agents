/**
 * Centralized templates for StandaloneJsonEditor and other JSON inputs
 */

// Context and configuration templates
export {
  contextVariablesTemplate,
  headersSchemaTemplate,
  statusUpdatesComponentsTemplate,
} from './context-templates';

// Headers templates
export {
  customHeadersTemplate,
  externalAgentHeadersTemplate,
  headersTemplate,
  teamAgentHeadersTemplate,
} from './headers-templates';

// Model provider options
export {
  azureModelProviderOptionsTemplate,
  azureModelSummarizerProviderOptionsTemplate,
  providerOptionsTemplate,
  structuredOutputModelProviderOptionsTemplate,
  summarizerModelProviderOptionsTemplate,
} from './model-templates';
export { reportAgentStarterTemplate } from './report-agent-templates';
// JSON Schema templates
export { basicSchemaTemplate, evaluatorSchemaTemplate } from './schema-templates';

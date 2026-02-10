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
  summarizerModelProviderOptionsTemplate,
} from './model-templates';

// JSON Schema templates
export { basicSchemaTemplate, evaluatorSchemaTemplate } from './schema-templates';

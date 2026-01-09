// Context configuration exports (builder patterns for defining context configs)
// Note: Context resolution runtime (ContextResolver, ContextFetcher, etc.) is in agents-run-api

export type { ContextConfigBuilderOptions } from './ContextConfig';
export {
  ContextConfigBuilder,
  contextConfig,
  fetchDefinition,
  headers,
} from './ContextConfig';
export type {
  TemplateContext,
  TemplateRenderOptions,
} from './TemplateEngine';
export { TemplateEngine } from './TemplateEngine';
export type { DotPaths } from './validation-helpers';

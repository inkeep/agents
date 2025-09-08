// Context system exports

export type { ContextConfigBuilderOptions } from './ContextConfig';
export {
  ContextConfigBuilder,
  contextConfig,
  fetchDefinition,
  createRequestSchema,
} from './ContextConfig';
export type { FetchResult } from './ContextFetcher';
export { ContextFetcher } from './ContextFetcher';
export type {
  ContextResolutionOptions,
  ContextResolutionResult,
  ResolvedContext,
} from './ContextResolver';
export { ContextResolver } from './ContextResolver';
export type {
  TemplateContext,
  TemplateRenderOptions,
} from './TemplateEngine';
export { TemplateEngine } from './TemplateEngine';
export { ContextCache } from './contextCache';
export {
  handleContextResolution,
  handleContextConfigChange,
  determineContextTrigger,
} from './context';

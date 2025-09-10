// Context system exports

export type { ContextConfigBuilderOptions } from './ContextConfig.js';
export {
  ContextConfigBuilder,
  contextConfig,
  createRequestSchema,
  fetchDefinition,
} from './ContextConfig.js';
export type { FetchResult } from './ContextFetcher.js';
export { ContextFetcher } from './ContextFetcher.js';
export type {
  ContextResolutionOptions,
  ContextResolutionResult,
  ResolvedContext,
} from './ContextResolver.js';
export { ContextResolver } from './ContextResolver.js';
export {
  determineContextTrigger,
  handleContextConfigChange,
  handleContextResolution,
} from './context.js';
export { ContextCache } from './contextCache.js';
export type {
  TemplateContext,
  TemplateRenderOptions,
} from './TemplateEngine.js';
export { TemplateEngine } from './TemplateEngine.js';

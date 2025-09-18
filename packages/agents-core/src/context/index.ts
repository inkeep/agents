// Context system exports

export type { ContextConfigBuilderOptions } from './ContextConfig';
export {
  ContextConfigBuilder,
  contextConfig,
  fetchDefinition,
} from './ContextConfig';
export type { FetchResult } from './ContextFetcher';
export { ContextFetcher } from './ContextFetcher';
export type {
  ContextResolutionOptions,
  ContextResolutionResult,
  ResolvedContext,
} from './ContextResolver';
export { ContextResolver } from './ContextResolver';
export {
  determineContextTrigger,
  handleContextConfigChange,
  handleContextResolution,
} from './context';
export { ContextCache } from './contextCache';
export type {
  TemplateContext,
  TemplateRenderOptions,
} from './TemplateEngine';
export { TemplateEngine } from './TemplateEngine';
export { AllowedPaths, createTemplateHelpers } from './validation';

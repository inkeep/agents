import { ModelFactory, type ModelSettings } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { isPromptCachingEnabled } from './caching-config';

const logger = getLogger('caching-actuator');

type ProviderOptionsBag = Record<string, unknown>;

type CacheableMessage = {
  role?: unknown;
  providerOptions?: ProviderOptionsBag;
  [key: string]: unknown;
};

type CacheableConfig = {
  providerOptions?: ProviderOptionsBag;
  messages?: CacheableMessage[];
  [key: string]: unknown;
};

/**
 * Internal, non-wire property set by buildInitialMessages on the most-recent conversation-history
 * content block. The actuator turns it into an Anthropic cacheControl marker (BP2) and strips it,
 * so it never reaches the provider. Kept here as the single source of truth shared with the prompt
 * builder.
 */
export const INKEEP_CACHE_BOUNDARY_PROP = '_inkeepCacheBoundary';

/**
 * Internal sentinel inserted into the assembled system prompt at the per-agent / per-conversation
 * boundary (R3). buildInitialMessages splits on it to emit the system as two consecutive system
 * messages — Sub-block A (per-agent stable, BP1) and Sub-block B+C (app context + agent/sub-agent
 * prompts) — so the stable prefix caches across an agent's conversations. The sentinel is removed
 * by the split and never reaches the wire.
 */
export const SYSTEM_CACHE_BOUNDARY_SENTINEL = '<<<INKEEP_SYSTEM_CACHE_BOUNDARY>>>';

const EPHEMERAL = { type: 'ephemeral' } as const;

function withAnthropicCacheControl<T extends { providerOptions?: ProviderOptionsBag }>(obj: T): T {
  const providerOptions = obj.providerOptions ?? {};
  const anthropic = (providerOptions.anthropic as ProviderOptionsBag | undefined) ?? {};
  return {
    ...obj,
    providerOptions: {
      ...providerOptions,
      anthropic: {
        ...anthropic,
        cacheControl: anthropic.cacheControl ?? EPHEMERAL,
      },
    },
  };
}

/**
 * Strip internal cache-boundary tags from content blocks (always), and — on direct-Anthropic routes
 * — turn the system message (BP1, tools+system prefix) and the tagged history block (BP2, prior
 * turns) into ephemeral cacheControl markers. Returns the SAME array reference (changed=false) when
 * there was nothing to do, so the caller can preserve config identity on no-op paths.
 */
function processMessages(
  messages: CacheableMessage[],
  markAnthropic: boolean
): { messages: CacheableMessage[]; changed: boolean } {
  let changed = false;
  const out = messages.map((msg) => {
    if (msg.role === 'system') {
      if (markAnthropic) {
        changed = true;
        return withAnthropicCacheControl(msg);
      }
      return msg;
    }
    if (Array.isArray(msg.content)) {
      let msgChanged = false;
      const content = (msg.content as unknown[]).map((part) => {
        if (part && typeof part === 'object' && INKEEP_CACHE_BOUNDARY_PROP in part) {
          msgChanged = true;
          const { [INKEEP_CACHE_BOUNDARY_PROP]: _drop, ...rest } = part as Record<string, unknown>;
          return markAnthropic
            ? withAnthropicCacheControl(rest as { providerOptions?: ProviderOptionsBag })
            : rest;
        }
        return part;
      });
      if (msgChanged) {
        changed = true;
        return { ...msg, content };
      }
      return msg;
    }
    return msg;
  });
  return changed ? { messages: out, changed: true } : { messages, changed: false };
}

/**
 * Collapse the run of consecutive system messages at the start of the array into one. Two
 * consecutive system blocks (R3) are only well-defined on direct-Anthropic routes, where they map to
 * a system-blocks array each carrying its own cacheControl. Every other provider (OpenAI, Gemini,
 * gateway) gets a single, universally-safe system message instead; the gateway's auto marker still
 * caches the prefix. Returns the SAME array reference when there is nothing to merge (0/1 leading
 * system messages), so the caller can preserve config identity on no-op paths.
 */
function mergeLeadingSystemMessages(messages: CacheableMessage[]): CacheableMessage[] {
  let count = 0;
  while (count < messages.length && messages[count]?.role === 'system') count++;
  if (count <= 1) return messages;
  const mergedContent = messages
    .slice(0, count)
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('');
  return [{ role: 'system', content: mergedContent }, ...messages.slice(count)];
}

export function attachPromptCaching<T extends CacheableConfig>(
  config: T,
  modelSettings: ModelSettings
): T {
  const enabled = isPromptCachingEnabled();
  const routesViaGateway = ModelFactory.shouldRouteViaGateway(modelSettings);

  const modelString = modelSettings.model?.trim();
  let provider = '';
  if (modelString) {
    try {
      provider = ModelFactory.parseModelString(modelString).provider;
    } catch (error) {
      // An unparseable model string (e.g. missing the `provider/` prefix) silently opts the call out
      // of prompt caching (provider !== 'anthropic'). Log it so a misconfigured model is visible
      // rather than a mysterious cache miss.
      provider = '';
      logger.warn(
        { modelString, error },
        'parseModelString failed; prompt caching disabled for this call'
      );
    }
  }

  const markAnthropic =
    enabled && !routesViaGateway && !!config.messages?.length && provider === 'anthropic';

  // Two consecutive system blocks only benefit direct-Anthropic (BP1 lands on the stable prefix).
  // For every other route, merge them to a single system message so multi-system-message handling
  // never depends on undefined per-provider behavior (OpenAI/Gemini/gateway).
  const baseMessages =
    !markAnthropic && config.messages?.length
      ? mergeLeadingSystemMessages(config.messages)
      : config.messages;
  const mergedSystem = baseMessages !== config.messages;

  // Always strip boundary tags so they never reach the wire (even when caching is disabled or the
  // route is not direct Anthropic). Place BP1/BP2 markers only on direct-Anthropic routes. Preserve
  // config identity when nothing changed.
  let result: T = config;
  if (baseMessages?.length) {
    const processed = processMessages(baseMessages, markAnthropic);
    if (processed.changed || mergedSystem) {
      result = { ...config, messages: processed.messages };
    }
  }

  // Gateway: let the gateway's auto marker handle the tools+system prefix. (Hand-placed manual
  // markers for gateway-routed Anthropic — including BP2 — are a follow-up; for now the history
  // tag is stripped above and BP2 is applied only on direct Anthropic routes.)
  if (enabled && routesViaGateway) {
    const providerOptions = result.providerOptions ?? {};
    const gateway = (providerOptions.gateway as ProviderOptionsBag | undefined) ?? {};
    result = {
      ...result,
      providerOptions: {
        ...providerOptions,
        gateway: {
          ...gateway,
          caching: gateway.caching ?? 'auto',
        },
      },
    };
  }

  return result;
}

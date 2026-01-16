import { context as otelContext, propagation } from '@opentelemetry/api';
import { createMiddleware } from 'hono/factory';
import { getLogger } from '../logger';

const logger = getLogger('tracing-middleware');    

export const otelBaggageMiddleware = () =>
  createMiddleware(async (c, next) => {
    const reqId = c.get('requestId');
    let bag = propagation.getBaggage(otelContext.active());
    if (!bag) {
      bag = propagation.createBaggage();
    }
    // Safety check for test environment where createBaggage might return undefined
    if (bag && typeof bag.setEntry === 'function') {
      bag = bag.setEntry('request.id', { value: String(reqId ?? 'unknown') });
      const ctxWithBag = propagation.setBaggage(otelContext.active(), bag);
      return await otelContext.with(ctxWithBag, async () => await next());
    }
    return next();
  });

export const executionBaggageMiddleware = () =>
  createMiddleware(async (c, next) => {
    // Get the API key context if available (set by auth middleware)
    const executionContext = c.get('executionContext');

    if (!executionContext) {
      // No API key context, skip baggage setup
      logger.debug({}, 'Empty execution context');
      return next();
    }

    const { tenantId, projectId, agentId } = executionContext;

    // Extract conversation ID from parsed body if present
    let conversationId: string | undefined;
    const requestBody = c.get('requestBody') || {};
    if (requestBody) {
      conversationId = requestBody.conversationId;
      if (!conversationId) {
        logger.debug({ requestBody }, 'No conversation ID found in request body');
      }
    }

    const entries = Object.fromEntries(
      Object.entries({
        'agent.id': agentId,
        'tenant.id': tenantId,
        'project.id': projectId,
        'conversation.id': conversationId,
      }).filter((entry): entry is [string, string] => {
        const [, v] = entry;
        return typeof v === 'string' && v.length > 0;
      })
    );

    if (!Object.keys(entries).length) {
      logger.debug({}, 'Empty entries for baggage');
      return next();
    }

    const bag = Object.entries(entries).reduce(
      (b, [key, value]) => b.setEntry(key, { value: value || '' }),
      propagation.getBaggage(otelContext.active()) ?? propagation.createBaggage()
    );

    const ctxWithBag = propagation.setBaggage(otelContext.active(), bag);
    return await otelContext.with(ctxWithBag, async () => await next());
  });
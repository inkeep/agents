---
name: api-logging-guidelines
description: "Best practices and guidelines for using logger in API routes. Defines appropriate logging levels, what to log, and when to avoid logging. Use when implementing or reviewing API route logging, debugging strategies, or optimizing log output."
---

# API Route Logging Guidelines

Comprehensive guidance for appropriate use of logging in API routes to maintain clean, useful, and performant logs.

---

## Core Principles

### 1. Avoid Redundant Logging

**DON'T log what's already logged by middleware:**
```typescript
// ❌ BAD - Request details are already logged by middleware
logger.info({ tenantId, projectId }, 'Getting project details');
```

**DO rely on request middleware logging:**
- Request/response middleware already logs: method, path, status, duration, path params
- These logs include tenant/project IDs from the URL path
- Adding duplicate logs creates noise without value

### 2. Log Level Guidelines

| Level | Use Case | Examples |
|-------|----------|----------|
| **ERROR** | Unexpected failures requiring attention | Database connection failures, unhandled exceptions, critical service errors |
| **WARN** | Recoverable issues or concerning patterns | Rate limiting triggered, deprecated API usage, fallback behavior activated |
| **INFO** | Important business events (NOT routine operations) | User account created, payment processed, critical configuration changed |
| **DEBUG** | Detailed diagnostic information | Query parameters, intermediate calculations, cache hit/miss details |

### 3. What TO Log

**Log these important events:**

```typescript
// ✅ GOOD - Important business event
logger.info({
  userId,
  oldPlan: 'free',
  newPlan: 'pro',
  mrr: 99
}, 'User upgraded subscription');

// ✅ GOOD - Error with context
logger.error({
  error,
  tenantId,
  webhookUrl,
  attemptNumber: 3
}, 'Webhook delivery failed after retries');

// ✅ GOOD - Security-relevant event
logger.warn({
  ip: c.req.header('x-forwarded-for'),
  userId,
  attemptedResource
}, 'Unauthorized access attempt');

// ✅ GOOD - Performance issue
logger.warn({
  duration: 5234,
  query,
  resultCount: 10000
}, 'Slow query detected');
```

### 4. What NOT to Log

**Avoid logging routine operations:**

```typescript
// ❌ BAD - Routine CRUD operation
logger.info('Getting user by ID');

// ❌ BAD - Already logged by middleware
logger.info(`Processing GET request to /api/users/${id}`);

// ❌ BAD - No actionable information
logger.info('Starting database query');

// ❌ BAD - Sensitive information
logger.info({ password, apiKey }, 'User login attempt');

// ❌ BAD - Overly granular
logger.debug('Entering function processUser');
logger.debug('Exiting function processUser');
```

---

## API Route Patterns

### Pattern 1: Error Handling

```typescript
// ✅ GOOD - Log errors with context
export const route = router.get('/:id', async (c) => {
  try {
    const result = await riskyOperation();
    return c.json(result);
  } catch (error) {
    // Log error with relevant context
    logger.error({
      error,
      userId: c.get('userId'),
      operation: 'riskyOperation',
      // Include any relevant debugging context
      requestId: c.get('requestId')
    }, 'Operation failed');

    // Return generic error to client (don't leak internals)
    return c.json({ error: 'Internal server error' }, 500);
  }
});
```

### Pattern 2: Business Events

```typescript
// ✅ GOOD - Log significant business events
export const route = router.post('/subscription/upgrade', async (c) => {
  const { planId } = await c.req.json();

  const result = await upgradeSubscription(userId, planId);

  // This is worth logging - it's a significant business event
  logger.info({
    userId,
    oldPlan: result.previousPlan,
    newPlan: result.newPlan,
    mrr: result.mrr,
    timestamp: new Date().toISOString()
  }, 'Subscription upgraded');

  return c.json(result);
});
```

### Pattern 3: Performance Monitoring

```typescript
// ✅ GOOD - Log performance issues
export const route = router.get('/search', async (c) => {
  const start = Date.now();
  const results = await performSearch(query);
  const duration = Date.now() - start;

  // Only log if performance is concerning
  if (duration > 1000) {
    logger.warn({
      duration,
      query,
      resultCount: results.length,
      cached: false
    }, 'Slow search query');
  }

  return c.json(results);
});
```

### Pattern 4: Security Events

```typescript
// ✅ GOOD - Log security-relevant events
export const route = router.post('/api/admin/*', async (c) => {
  const hasPermission = await checkPermission(userId, resource);

  if (!hasPermission) {
    // Log unauthorized access attempts
    logger.warn({
      userId,
      resource,
      ip: c.req.header('x-forwarded-for'),
      userAgent: c.req.header('user-agent')
    }, 'Unauthorized access attempt');

    return c.json({ error: 'Forbidden' }, 403);
  }

  // Proceed with authorized request...
});
```

---

## Environment-Specific Guidelines

### Development
```typescript
// More verbose logging acceptable in development
if (process.env.NODE_ENV === 'development') {
  logger.debug({ params, body }, 'Request details');
}
```

### Production
- Minimize INFO level logs to important events only
- Never log sensitive data (passwords, tokens, keys, PII)
- Use structured logging for better searchability
- Include correlation IDs for tracing requests

---

## Migration Strategy

When refactoring existing verbose logging:

1. **Identify redundant logs**: Remove logs that duplicate middleware logging
2. **Downgrade routine operations**: Move routine operations from INFO to DEBUG
3. **Enhance error logs**: Add more context to error logs
4. **Add business event logs**: Ensure important business events are logged
5. **Review log levels**: Ensure each log uses the appropriate level

### Before:
```typescript
router.get('/:id', async (c) => {
  const { id } = c.req.param();
  logger.info({ id }, 'Getting item by ID');  // Redundant

  const item = await getItem(id);
  logger.info({ item }, 'Retrieved item');     // Too verbose

  return c.json(item);
});
```

### After:
```typescript
router.get('/:id', async (c) => {
  const { id } = c.req.param();

  try {
    const item = await getItem(id);
    // No logging needed - routine successful operation
    return c.json(item);
  } catch (error) {
    // Only log errors
    logger.error({ error, id }, 'Failed to retrieve item');
    return c.json({ error: 'Item not found' }, 404);
  }
});
```

---

## Debugging Without Verbose Logs

Instead of verbose logging, use these strategies:

1. **Use debug mode selectively**: Enable DEBUG level for specific modules when troubleshooting
2. **Use tracing**: OpenTelemetry/Jaeger for distributed tracing
3. **Use metrics**: Prometheus/StatsD for performance metrics
4. **Use error tracking**: Sentry/Rollbar for error aggregation
5. **Use feature flags**: Enable verbose logging for specific users/requests when debugging

---

## Summary Checklist

Before adding a log statement, ask:

- [ ] Is this already logged by middleware? (method, path, status, params)
- [ ] Is this a significant business event or just routine operation?
- [ ] Does this log provide actionable information?
- [ ] Am I using the correct log level?
- [ ] Am I including helpful context without sensitive data?
- [ ] Will this log be useful in production or just create noise?

**Remember**: Good logging is about signal, not volume. Every log should serve a purpose.
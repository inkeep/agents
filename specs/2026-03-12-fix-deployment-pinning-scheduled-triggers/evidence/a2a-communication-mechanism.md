# Evidence: A2A Communication Uses In-Process Fetch

**Date:** 2026-03-12
**Sources:** executionHandler.ts, in-process-fetch.ts, createApp.ts

## Finding: A2A calls are in-process, not network-routed

**Confidence:** CONFIRMED

A2A calls use `getInProcessFetch()` (executionHandler.ts:301), which routes through the Hono app's middleware stack **in-process** rather than over the network.

```typescript
// executionHandler.ts:291-302
const a2aClient = new A2AClient(agentBaseUrl, {
  headers: { Authorization: `Bearer ${authToken}`, ... },
  fetchFn: getInProcessFetch(),  // ← in-process, NOT network
});
```

`getInProcessFetch()` is registered at app startup:
```typescript
// createApp.ts:~200
registerAppFetch(base.request.bind(base) as typeof fetch);
```

**Implications for deployment pinning:**
- An in-flight workflow's A2A calls stay on the same deployment instance
- They do NOT go through a load balancer or production domain
- A workflow that started on deployment A will execute ALL its A2A calls on deployment A
- This is the DESIRED behavior for in-flight consistency

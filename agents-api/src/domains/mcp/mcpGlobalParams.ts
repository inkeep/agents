/**
 * Bind `tenantId` to the session instead of requiring it per tool call.
 *
 * The OAuth user JWT already carries the tenant (`https://inkeep.com/tenantId`),
 * so making the LLM pass `tenantId` on every tool is redundant (and lets it pass
 * the wrong one). This post-process hook, run on the per-request MCP server before
 * connect(), (1) OMITS `tenantId` from each tool's exposed input schema so the LLM
 * never sees it, and (2) INJECTS the session tenant into the request before the
 * downstream SDK call.
 *
 * The generated tools register an input schema shaped `z.object({ request: <ZodObject> })`.
 * The outer is a zod-mini object (no `.extend`), so we swap the request sub-schema via the
 * outer's internal def (`_zod.def.shape.request`) — verified to be the live source the SDK
 * serializes from. The inner request is a classic ZodObject with `.omit`.
 *
 * Mechanics rely on two verified MCP-SDK facts: the input schema is serialized lazily at
 * `tools/list`, and `_registeredTools[name].{inputSchema,handler}` are mutable. Best-effort:
 * any tool whose shape differs is left untouched and logged. The longer-term home is an
 * `x-speakeasy-globals` parameter in the OpenAPI + SDK regen — see mcp-allowlist.md.
 */

import { getRegisteredTools } from './mcpServerInternals';

interface BindLogger {
  debug: (obj: unknown, msg: string) => void;
  warn: (obj: unknown, msg: string) => void;
}

/**
 * Result of a bind pass. `expected` is the number of tenant-scoped tools detected;
 * `injected` is how many had the session-tenant injection installed (the security
 * guarantee); `hidden` is how many also had `tenantId` dropped from their exposed
 * schema (cosmetic). The caller should treat `injected < expected` as a fail-closed
 * signal — see mcp.ts.
 */
export interface BindResult {
  expected: number;
  injected: number;
  hidden: number;
}

/**
 * Bind the session tenant onto every tenant-scoped tool. Two operations, deliberately
 * decoupled so the security-critical one cannot be skipped by a failure in the other:
 *
 *   1. INJECTION (security): wrap `tool.handler` to OVERWRITE `request.tenantId` with the
 *      session tenant on every call. This is what actually enforces the binding — even if
 *      the LLM supplies a tenantId, it is replaced. Attempted first and unconditionally.
 *   2. HIDING (cosmetic): drop `tenantId` from the exposed input schema so the LLM never
 *      sees the field. If the SDK schema shape drifts and this fails, injection (1) still
 *      enforces the correct tenant, so the tool stays fail-closed.
 */
export function bindTenantId(
  mcpServer: unknown,
  tenantId: string,
  logger?: BindLogger
): BindResult {
  const tools = getRegisteredTools(mcpServer);
  if (!tools) return { expected: 0, injected: 0, hidden: 0 };

  let expected = 0;
  let injected = 0;
  let hidden = 0;
  for (const [name, tool] of Object.entries(tools)) {
    const inputSchema = tool.inputSchema;
    const reqSchema = inputSchema?.shape?.request;
    if (!reqSchema?.shape || !('tenantId' in reqSchema.shape)) continue;
    expected += 1;

    // 1. INJECTION (security-critical). The MCP SDK (>=1.26) invokes the tool via `handler`
    //    (NOT `callback`); the parsed input is `{ request: {...} }`. Overwrite tenantId so a
    //    value the LLM supplied (correct or not) can never reach the downstream SDK call.
    const original = tool.handler;
    if (typeof original === 'function') {
      tool.handler = (...args: unknown[]) => {
        const input = args[0] as { request?: Record<string, unknown> } | undefined;
        if (input?.request && typeof input.request === 'object') {
          input.request.tenantId = tenantId;
          logger?.debug({ tool: name, tenantId }, 'MCP bindTenantId: injected session tenant');
        }
        return original(...args);
      };
      injected += 1;
    } else {
      // A tenant-scoped tool with no callable handler can't execute, but surface it loudly:
      // injected < expected is the route's fail-closed signal.
      logger?.warn(
        { tool: name },
        'MCP bindTenantId: tenant-scoped tool has no handler; tenantId NOT injected'
      );
    }

    // 2. HIDING (cosmetic). Drop tenantId from the exposed schema. A failure here leaves the
    //    field visible to the LLM but injection above still overwrites it — fail-closed.
    try {
      const omittedReq = reqSchema.omit?.({ tenantId: true });
      const outerDefShape = inputSchema?._zod?.def?.shape;
      if (omittedReq && outerDefShape && 'request' in outerDefShape) {
        outerDefShape.request = omittedReq;
        hidden += 1;
      }
    } catch (error) {
      logger?.debug(
        { tool: name, error },
        'MCP bindTenantId: could not hide tenantId from schema (injection still enforced)'
      );
    }
  }
  return { expected, injected, hidden };
}

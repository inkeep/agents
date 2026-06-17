/**
 * Shared structural types + accessors for the (untyped) MCP SDK internals that the
 * `/mcp` post-process helpers reach into — `fillMissingToolTitles`, `bindTenantId`,
 * `augmentToolDescriptions`, and `setServerInstructions`.
 *
 * The Speakeasy-generated `createMCPServer` returns a server whose tool registry and
 * low-level Server are not part of the public SDK type surface, so we describe them
 * structurally here. Centralizing it gives ONE place to update on an SDK upgrade, and
 * the mcp/* tests exercise these accessors against the real generated server, so drift
 * fails CI rather than silently no-opping.
 */

/** The inner request schema of a generated tool: `z.object({ request: <ZodObject> })`. */
export interface ZodRequestObject {
  shape?: Record<string, unknown>;
  omit?: (mask: Record<string, true>) => unknown;
}

/** A single entry in the SDK's `_registeredTools` map (only the fields we touch). */
export interface RegisteredToolInternal {
  title?: string;
  description?: string;
  annotations?: { title?: string };
  inputSchema?: {
    shape?: { request?: ZodRequestObject };
    _zod?: { def?: { shape?: Record<string, unknown> } };
  };
  handler?: (...args: unknown[]) => unknown;
}

interface McpServerShape {
  server?: {
    _registeredTools?: Record<string, RegisteredToolInternal>;
    // McpServer.server is the low-level Server that emits `instructions` at initialize.
    server?: { _instructions?: string };
  };
}

/** The tool registry the SDK serializes lazily at `tools/list`; mutable before connect(). */
export function getRegisteredTools(
  mcpServer: unknown
): Record<string, RegisteredToolInternal> | undefined {
  return (mcpServer as McpServerShape)?.server?._registeredTools;
}

/** The low-level Server whose `_instructions` is returned in the initialize handshake. */
export function getLowLevelServer(mcpServer: unknown): { _instructions?: string } | undefined {
  return (mcpServer as McpServerShape)?.server?.server;
}

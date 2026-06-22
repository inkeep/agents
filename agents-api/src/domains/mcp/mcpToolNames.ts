/**
 * Rename the hash-truncated tool names at the MCP boundary.
 *
 * Speakeasy truncates long operationIds and appends a content hash, producing tools
 * that are unusable by name alone: `scheduled-triggers-cancel-scheduled-trigger-747`
 * vs `…-rerun-…-825` vs `…-get-…-a41`. An agent that selects tools by name mis-routes,
 * and these are the destructive invocation sub-resources. We rename them to short,
 * descriptive, unique names in the registry before connect (mirrors fillMissingToolTitles).
 *
 * The permanent home is the `x-speakeasy-mcp.name` overlay (.speakeasy/overlays/mcp-overlay.yaml);
 * this runtime rename is the interim that works without regenerating the SDK. The allowlist
 * (mcpAllowedTools.ts) still lists the GENERATED (hashed) names — that is the filter
 * createMCPServer applies; this rename runs after the filter. See
 * reports/mcp-schema-payload-size-research.md.
 */

import { getLogger } from '../../logger';
import { getRegisteredTools } from './mcpServerInternals';

const logger = getLogger('mcp');

/**
 * Generated (hashed) name -> clean name. Keys must match the generated registry; the
 * mcp/* tests assert the source names still exist, so a hash change (regen drift) fails CI
 * instead of silently leaving a tool un-renamed.
 */
export const HASHED_TOOL_RENAMES: Record<string, string> = {
  'scheduled-triggers-cancel-scheduled-trigger-747': 'scheduled-triggers-cancel-invocation',
  'scheduled-triggers-get-scheduled-trigger-a41': 'scheduled-triggers-get-invocation',
  'scheduled-triggers-list-scheduled-trigger-61d': 'scheduled-triggers-list-invocations',
  'scheduled-triggers-rerun-scheduled-trigger-825': 'scheduled-triggers-rerun-invocation',
  'user-project-memberships-list-user-project-88a': 'user-project-memberships-list',
};

/**
 * Rename hashed tools in the registry. The `tools/list` handler and `tools/call` lookup
 * both key off the registry entry's name, so moving the entry renames the tool for both
 * discovery and invocation. Best-effort; skips a rename whose target already exists.
 */
export function renameHashedTools(mcpServer: unknown): void {
  const tools = getRegisteredTools(mcpServer);
  if (!tools) return;
  for (const [from, to] of Object.entries(HASHED_TOOL_RENAMES)) {
    const tool = tools[from];
    if (!tool) continue;
    if (tools[to]) {
      // A tool already occupies the clean name — skip rather than clobber it.
      logger.warn({ from, to }, 'MCP: skipped tool rename; target name already exists');
      continue;
    }
    // Keep any self-referential name on the entry in sync, then move the registry key.
    const renamed = tool as typeof tool & { name?: string };
    if (renamed.name === from) renamed.name = to;
    tools[to] = tool;
    delete tools[from];
  }
}

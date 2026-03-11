// Export the core McpTool type for convenience
import type { McpTool as Tool } from '@inkeep/agents-core';
import type { WithTimestamps } from '@inkeep/agents-core/client-exports';

export type MCPTool = WithTimestamps<Tool>;

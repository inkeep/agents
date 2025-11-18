/**
 * Tool policy configuration for individual tools within an MCP server
 */
export interface ToolPolicy {
  /**
   * Whether this specific tool requires user approval before execution
   * If true, tool execution will pause and wait for explicit user approval
   * If false/undefined, tool executes immediately when called
   */
  needsApproval?: boolean;

  // Future extensibility:
  // transform?: TransformFnConfig;
  // rateLimit?: RateLimitConfig;
  // permissions?: PermissionConfig;
}

/**
 * Flexible tool selection format for MCP servers
 * Can be either a simple string (tool name) or an object with policies
 */
export type McpToolSelection =
  | string
  | {
      name: string;
      needsApproval?: boolean;
      // Future fields can be added here
    };

/**
 * Input format for configuring MCP tool usage in agents
 */
export interface AgentMcpConfigInput {
  selectedTools?: McpToolSelection[];
  headers?: Record<string, string>;
}

/**
 * Normalized format stored in database and used at runtime
 */
export interface AgentMcpConfig {
  server: any; // Tool reference
  selectedTools?: string[]; // Just the tool names
  headers?: Record<string, string>;
  toolPolicies?: Record<string, ToolPolicy>; // Per-tool policies
}

/**
 * Helper function to normalize McpToolSelection[] into separate arrays
 */
export function normalizeToolSelections(selections?: McpToolSelection[]): {
  selectedTools: string[];
  toolPolicies: Record<string, ToolPolicy>;
} {
  if (!selections || selections.length === 0) {
    return { selectedTools: [], toolPolicies: {} };
  }

  const selectedTools: string[] = [];
  const toolPolicies: Record<string, ToolPolicy> = {};

  for (const selection of selections) {
    if (typeof selection === 'string') {
      // Simple string selection
      selectedTools.push(selection);
    } else {
      // Object selection with policies
      selectedTools.push(selection.name);

      const policy: ToolPolicy = {};
      if (selection.needsApproval !== undefined) {
        policy.needsApproval = selection.needsApproval;
      }

      // Only add to toolPolicies if there are actual policies
      if (Object.keys(policy).length > 0) {
        toolPolicies[selection.name] = policy;
      }
    }
  }

  return { selectedTools, toolPolicies };
}

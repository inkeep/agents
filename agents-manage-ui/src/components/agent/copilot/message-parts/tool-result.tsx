import type { DataOperationEvent, SubAgentToolRelationResponse } from '@inkeep/agents-core';
import type z from 'zod';
import type { OAuthLoginHandler } from '../components/connect-tool-card';
import { SubAgentToolRelationResult } from '../components/sub-agent-tool-relation-result';

interface ToolResultData {
  toolName: string;
  toolCallId: string;
  output: {
    result: {
      content: Record<string, any>[];
    };
    toolCallId: string;
  };
  needsApproval: true;
}

export type ToolCallResultData = DataOperationEvent & {
  type: 'tool_result';
  details: DataOperationEvent['details'] & {
    data: ToolResultData;
  };
};

interface ToolResultProps {
  data: ToolCallResultData;
  copilotAgentId?: string;
  copilotProjectId?: string;
  copilotTenantId?: string;
  runApiUrl?: string;
  targetTenantId?: string;
  targetProjectId?: string;
  targetAgentId?: string;
  onOAuthLogin?: OAuthLoginHandler;
}

// ============================================================================
// Type Guards for Different Tool Result Types
// ============================================================================
// Add a type guard for each new tool result type you want to support

type AgentToolRelationResponse = z.infer<typeof SubAgentToolRelationResponse>;
type SubAgentToolRelation = AgentToolRelationResponse['data'];

function isSubAgentToolRelationResponse(
  item: Record<string, any>
): item is { text: { SubAgentToolRelationResponse: AgentToolRelationResponse }; type: string } {
  return (
    item &&
    typeof item === 'object' &&
    'text' in item &&
    'SubAgentToolRelationResponse' in item.text
  );
}

// Example: Add more type guards here for other result types
// function isAnotherToolResultType(item: Record<string, any>): item is { text: { AnotherToolResult: AnotherType }; type: string } {
//   return item && typeof item === 'object' && 'text' in item && 'AnotherToolResult' in item.text;
// }

// ============================================================================
// Parser Functions
// ============================================================================
// Each parser extracts a specific type of result from the content array

function parseSubAgentToolRelations(content: Record<string, any>[]): SubAgentToolRelation[] {
  return content
    .filter(isSubAgentToolRelationResponse)
    .map((item) => item.text.SubAgentToolRelationResponse.data);
}

// Example: Add more parsers here for other result types
// function parseOtherToolResultType(content: Record<string, any>[]): OtherType[] {
//   return content
//     .filter(isAnotherToolResultType)
//     .map((item) => item.text.AnotherToolResult.data);
// }

// ============================================================================
// Main Component
// ============================================================================

/**
 * Orchestrates rendering of different tool result types from agent operations.
 *
 * This component:
 * 1. Parses the raw tool result content using type-specific parsers
 * 2. Delegates rendering to specialized result components in ../components/
 *
 * Currently supported result types:
 * - SubAgentToolRelationResponse → SubAgentToolRelationResult component
 *
 * To add support for a new tool result type:
 * 1. Create a type guard function (see isSubAgentToolRelationResponse above)
 * 2. Create a parser function (see parseSubAgentToolRelations above)
 * 3. Create a result component in ../components/ (see sub-agent-tool-relation-result.tsx)
 * 4. Add the parser call and renderer in this component
 */
export const ToolResult = ({
  data,
  targetTenantId,
  targetProjectId,
  onOAuthLogin,
}: ToolResultProps) => {
  const content = data.details.data.output?.result?.content || [];

  // Parse different tool result types
  const toolRelations = parseSubAgentToolRelations(content);

  // Add more parsers here as new types are supported:
  // const otherResults = parseOtherToolResultType(content);

  const handleConnect: OAuthLoginHandler = async (params) => {
    if (!onOAuthLogin) {
      throw new Error('OAuth handler not provided');
    }
    await onOAuthLogin(params);
  };

  if (toolRelations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 py-3">
      {/* Render SubAgentToolRelation results (MCP connection cards) */}
      <SubAgentToolRelationResult
        relations={toolRelations}
        targetTenantId={targetTenantId}
        targetProjectId={targetProjectId}
        onConnect={handleConnect}
      />

      {/* Add more result renderers here as new types are supported:
      <AnotherToolResult
        results={otherResults}
        // ... other props
      /> */}
    </div>
  );
};

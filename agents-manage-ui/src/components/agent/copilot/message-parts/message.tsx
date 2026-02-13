import type { ToolUIPart } from 'ai';
import type { OAuthLoginHandler } from '@/components/agent/copilot/components/connect-tool-card';
import { SubAgentToolRelationResult } from '../components/sub-agent-tool-relation-result';
import { ToolApproval } from './tool-approval';

// Helper to extract SubAgentToolRelation data from tool-* part output
function parseToolOutputForRelations(content: any[]): any[] {
  return content
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        'text' in item &&
        item.text?.SubAgentToolRelationResponse?.data
    )
    .map((item) => item.text.SubAgentToolRelationResponse.data);
}

export const IkpTool = ({
  tool,
  approve,
  targetTenantId,
  targetProjectId,
  onOAuthLogin,
  refreshAgentGraph,
}: {
  tool: ToolUIPart;
  approve: (approved?: boolean) => Promise<void>;
  targetTenantId?: string;
  targetProjectId?: string;
  onOAuthLogin?: OAuthLoginHandler;
  refreshAgentGraph?: (options?: { fetchTools?: boolean }) => Promise<void>;
}) => {
  const needsApproval = tool.approval?.id;
  const output = tool.output as Record<string, any> | undefined;
  const isToolRelation = output?.content.length > 0;

  if (!needsApproval && !isToolRelation) return null;

  if (needsApproval) {
    return <ToolApproval tool={tool} approve={approve} />;
  }

  if (isToolRelation) {
    // Extract SubAgentToolRelation data directly from tool output
    const toolRelations = parseToolOutputForRelations(output?.content);

    if (toolRelations.length > 0) {
      const handleConnect: OAuthLoginHandler = async (params) => {
        if (!onOAuthLogin) {
          throw new Error('OAuth handler not provided');
        }
        await onOAuthLogin(params);
      };

      return (
        <div className="py-3">
          <SubAgentToolRelationResult
            relations={toolRelations}
            targetTenantId={targetTenantId}
            targetProjectId={targetProjectId}
            onConnect={handleConnect}
            refreshAgentGraph={refreshAgentGraph}
          />
        </div>
      );
    }
    return null;
  }

  return null;
};

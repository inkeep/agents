import type { SubAgentToolRelationResponse } from '@inkeep/agents-core';
import type { ToolUIPart } from 'ai';
import type z from 'zod';
import type { OAuthLoginHandler } from '@/components/agent/copilot/components/connect-tool-card';
import { SubAgentToolRelationResult } from '../components/sub-agent-tool-relation-result';
import { ToolApproval } from './tool-approval';

type SubAgentToolRelation = z.infer<typeof SubAgentToolRelationResponse>['data'];

interface ToolOutputContent {
  text?: { SubAgentToolRelationResponse?: { data: SubAgentToolRelation } };
}

interface IkpToolProps {
  tool: ToolUIPart;
  approve: (approved?: boolean) => Promise<void>;
  targetTenantId?: string;
  targetProjectId?: string;
  onOAuthLogin?: OAuthLoginHandler;
  refreshAgentGraph?: (options?: { fetchTools?: boolean }) => Promise<void>;
}

function parseToolOutputForRelations(content: ToolOutputContent[]): SubAgentToolRelation[] {
  return content.flatMap((item) => {
    const data = item.text?.SubAgentToolRelationResponse?.data;
    return data ? [data] : [];
  });
}

export const IkpTool = ({
  tool,
  approve,
  targetTenantId,
  targetProjectId,
  onOAuthLogin,
  refreshAgentGraph,
}: IkpToolProps) => {
  if (tool.approval?.id) {
    return <ToolApproval tool={tool} approve={approve} />;
  }

  const output = tool.output as { content?: ToolOutputContent[] } | undefined;
  const toolRelations = output?.content?.length ? parseToolOutputForRelations(output.content) : [];

  if (toolRelations.length === 0) return null;

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
};

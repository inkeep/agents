import type { SubAgentToolRelationResponse } from '@inkeep/agents-core';
import type z from 'zod';
import { ConnectToolCard, type OAuthLoginHandler } from './connect-tool-card';

type AgentToolRelationResponse = z.infer<typeof SubAgentToolRelationResponse>;
type SubAgentToolRelation = AgentToolRelationResponse['data'];

interface SubAgentToolRelationResultProps {
  relations: SubAgentToolRelation[];
  targetTenantId?: string;
  targetProjectId?: string;
  onConnect: OAuthLoginHandler;
}

/**
 * Renders SubAgentToolRelation results as MCP connection cards.
 * This is shown when an agent creates tool relationships that require OAuth authentication.
 */
export function SubAgentToolRelationResult({
  relations,
  targetTenantId,
  targetProjectId,
  onConnect,
}: SubAgentToolRelationResultProps) {
  if (relations.length === 0) {
    return null;
  }

  return (
    <>
      {relations.map((relation) => (
        <ConnectToolCard
          key={relation.id}
          toolId={relation.toolId}
          targetTenantId={targetTenantId}
          targetProjectId={targetProjectId}
          onConnect={onConnect}
        />
      ))}
    </>
  );
}


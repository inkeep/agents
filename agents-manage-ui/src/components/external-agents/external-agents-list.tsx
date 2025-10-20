'use client';

import { useParams } from 'next/navigation';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { ExternalAgentItem } from './external-agent-item';

interface ExternalAgentsListProps {
  externalAgents: ExternalAgent[];
}

export function ExternalAgentsList({ externalAgents }: ExternalAgentsListProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {externalAgents?.map((externalAgent: ExternalAgent) => (
        <ExternalAgentItem
          key={externalAgent.id}
          tenantId={tenantId}
          projectId={projectId}
          externalAgent={externalAgent}
        />
      ))}
    </div>
  );
}

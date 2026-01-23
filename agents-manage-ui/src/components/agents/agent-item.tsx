'use client';

import {
  ItemCardContent,
  ItemCardDescription,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import type { Agent } from '@/lib/types/agent-full';
import { formatDate } from '@/lib/utils/format-date';
import { AgentItemMenu } from './agent-item-menu';

interface AgentItemProps extends Agent {
  tenantId: string;
  projectId: string;
}

export function AgentItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: AgentItemProps) {
  const linkPath = `/${tenantId}/projects/${projectId}/agents/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-sm">{name}</ItemCardTitle>
        </ItemCardLink>
        <AgentItemMenu
          id={id}
          name={name}
          description={description}
          projectId={projectId}
          tenantId={tenantId}
        />
      </ItemCardHeader>
      <ItemCardContent>
        <ItemCardDescription hasContent={!!description}>
          {description || 'No description'}
        </ItemCardDescription>
        <ItemCardFooter footerText={`Created ${formatDate(createdAt)}`} />
      </ItemCardContent>
    </ItemCardRoot>
  );
}

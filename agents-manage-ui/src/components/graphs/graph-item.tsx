'use client';

import { formatDate } from '@/app/utils/format-date';
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
import { GraphItemMenu } from './agent-item-menu';

export interface GraphItemProps extends Agent {
  tenantId: string;
  projectId: string;
}

export function GraphItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: GraphItemProps) {
  const linkPath = `/${tenantId}/projects/${projectId}/agent/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-sm">{name}</ItemCardTitle>
        </ItemCardLink>
        <GraphItemMenu agentId={id} graphName={name} />
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

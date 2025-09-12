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
import type { Graph } from '@/lib/types/graph-full';
import { GraphItemMenu } from './graph-item-menu';

export interface GraphItemProps extends Graph {
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
  const linkPath = `/${tenantId}/projects/${projectId}/graphs/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-sm">{name}</ItemCardTitle>
        </ItemCardLink>
        <GraphItemMenu graphId={id} graphName={name} />
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

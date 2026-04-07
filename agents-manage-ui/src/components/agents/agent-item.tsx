'use client';

import {
  ItemCardContent,
  ItemCardDescription,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import type { Agent } from '@/lib/types/agent-full';
import { formatDate } from '@/lib/utils/format-date';
import { AgentItemMenu } from './agent-item-menu';
import NextLink from 'next/link';

interface AgentItemProps extends Agent {
  tenantId: string;
  projectId: string;
  canEdit?: boolean;
}

export function AgentItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
  canEdit = false,
}: AgentItemProps) {
  return (
    <NextLink href={`/${tenantId}/projects/${projectId}/agents/${id}`}>
      <ItemCardRoot>
        <ItemCardHeader>
          <ItemCardTitle className="text-sm">{name}</ItemCardTitle>
          {canEdit && (
            <AgentItemMenu
              id={id}
              name={name}
              description={description}
              projectId={projectId}
              tenantId={tenantId}
            />
          )}
        </ItemCardHeader>
        <ItemCardContent>
          <ItemCardDescription hasContent={!!description}>
            {description || 'No description'}
          </ItemCardDescription>
          <ItemCardFooter footerText={`Created ${formatDate(createdAt)}`} />
        </ItemCardContent>
      </ItemCardRoot>
    </NextLink>
  );
}

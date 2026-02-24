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
  const linkPath = `/${tenantId}/projects/${projectId}/agents/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-sm">{name}</ItemCardTitle>
        </ItemCardLink>
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
        <ItemCardFooter
          footerText={`Created ${formatDate(createdAt)} [DEBUG raw: ${JSON.stringify(createdAt)}]`}
        />
      </ItemCardContent>
    </ItemCardRoot>
  );
}

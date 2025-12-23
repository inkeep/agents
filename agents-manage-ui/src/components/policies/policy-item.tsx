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
import type { Policy } from '@/lib/types/policies';

interface PolicyItemProps extends Policy {
  tenantId: string;
  projectId: string;
}

export function PolicyItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: PolicyItemProps) {
  const linkPath = `/${tenantId}/projects/${projectId}/policies/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-md">{name}</ItemCardTitle>
        </ItemCardLink>
      </ItemCardHeader>
      <ItemCardContent>
        <ItemCardDescription hasContent={!!description} className="line-clamp-2">
          {description || 'No description'}
        </ItemCardDescription>
        <ItemCardFooter footerText={`Created ${formatDate(createdAt)}`} />
      </ItemCardContent>
    </ItemCardRoot>
  );
}

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
import type { DataComponent } from '@/lib/api/data-components';
import { DataComponentItemMenu } from './data-component-item-menu';

export function DataComponentItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: DataComponent & { tenantId: string; projectId: string }) {
  const linkPath = `/${tenantId}/projects/${projectId}/data-components/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-md">{name}</ItemCardTitle>
        </ItemCardLink>
        <DataComponentItemMenu dataComponentId={id} dataComponentName={name} />
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

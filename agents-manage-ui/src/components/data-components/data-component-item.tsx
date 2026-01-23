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
import { useProjectPermissions } from '@/contexts/project';
import type { DataComponent } from '@/lib/api/data-components';
import { formatDate } from '@/lib/utils/format-date';
import { DataComponentItemMenu } from './data-component-item-menu';

export function DataComponentItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: DataComponent & { tenantId: string; projectId: string }) {
  const { canEdit } = useProjectPermissions();
  const linkPath = `/${tenantId}/projects/${projectId}/components/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-md">{name}</ItemCardTitle>
        </ItemCardLink>
        {canEdit && <DataComponentItemMenu dataComponentId={id} dataComponentName={name} />}
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

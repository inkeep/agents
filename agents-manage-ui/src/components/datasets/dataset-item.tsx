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
import type { Dataset } from '@/lib/api/datasets';
import { DatasetItemMenu } from './dataset-item-menu';

export interface DatasetItemProps extends Dataset {
  tenantId: string;
  projectId: string;
}

export function DatasetItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: DatasetItemProps) {
  const linkPath = `/${tenantId}/projects/${projectId}/datasets/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-sm">{name || 'Unnamed Test Suite'}</ItemCardTitle>
        </ItemCardLink>
        <DatasetItemMenu datasetId={id} datasetName={name || 'Unnamed Test Suite'} />
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

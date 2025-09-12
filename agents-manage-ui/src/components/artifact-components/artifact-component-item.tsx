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
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import { ArtifactComponentItemMenu } from './artifact-component-item-menu';

export function ArtifactComponentItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: ArtifactComponent & { tenantId: string; projectId: string }) {
  const linkPath = `/${tenantId}/projects/${projectId}/artifact-components/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-md">{name}</ItemCardTitle>
        </ItemCardLink>
        <ArtifactComponentItemMenu artifactComponentId={id} artifactComponentName={name} />
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

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
import type { ArtifactComponent } from '@/lib/api/artifact-components';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import { formatDate } from '@/lib/utils/format-date';
import { ArtifactComponentItemMenu } from './artifact-component-item-menu';

export function ArtifactComponentItem({
  id,
  name,
  description,
  createdAt,
  tenantId,
  projectId,
}: ArtifactComponent & { tenantId: string; projectId: string }) {
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const linkPath = `/${tenantId}/projects/${projectId}/artifacts/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-md">{name}</ItemCardTitle>
        </ItemCardLink>
        {canEdit && (
          <ArtifactComponentItemMenu artifactComponentId={id} artifactComponentName={name} />
        )}
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

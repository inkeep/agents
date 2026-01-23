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
import type { ArtifactComponent } from '@/lib/api/artifact-components';
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
  const { canEdit } = useProjectPermissions();
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

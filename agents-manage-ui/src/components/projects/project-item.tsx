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
import type { Project } from '@/lib/types/project';
import { ProjectItemMenu } from './project-item-menu';

export interface ProjectItemProps extends Project {
  tenantId: string;
  projectId: string;
}

export function ProjectItem({
  id,
  projectId,
  name,
  description,
  models,
  stopWhen,
  createdAt,
  tenantId,
}: ProjectItemProps) {
  const linkPath = `/${tenantId}/projects/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-sm">{name}</ItemCardTitle>
        </ItemCardLink>
        <ProjectItemMenu
          projectName={name}
          projectData={{ id: projectId, name, description, models, stopWhen }}
          tenantId={tenantId}
        />
      </ItemCardHeader>
      <ItemCardLink href={linkPath} className="group">
        <ItemCardContent>
          <ItemCardDescription hasContent={!!description}>
            {description || 'No description'}
          </ItemCardDescription>
          <ItemCardFooter footerText={`Created ${formatDate(createdAt)}`} />
        </ItemCardContent>
      </ItemCardLink>
    </ItemCardRoot>
  );
}

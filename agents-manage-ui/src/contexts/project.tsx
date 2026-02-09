'use client';

import type { ProjectPermissions } from '@inkeep/agents-core';
import { createContext, type FC, type ReactNode, use } from 'react';
import type { Project } from '@/lib/types/project';

interface ProjectContextValue {
  project: Project;
  permissions: ProjectPermissions;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export const ProjectProvider: FC<{
  children: ReactNode;
  value: ProjectContextValue;
}> = (props) => <ProjectContext {...props} />;

export function useProject() {
  const ctx = use(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used within a <ProjectProvider />');
  }

  return ctx;
}

/**
 * Hook to get project permissions from context.
 * Throws an error if used outside a ProjectProvider.
 */
export function useProjectPermissions(): ProjectPermissions {
  const context = use(ProjectContext);
  if (!context) {
    throw new Error('useProjectPermissions must be used within a <ProjectProvider />');
  }
  return context.permissions;
}

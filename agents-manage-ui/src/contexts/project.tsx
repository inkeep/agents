'use client';

import type { ProjectPermissions } from '@inkeep/agents-core';
import { createContext, type FC, type ReactNode, useContext } from 'react';
import type { Project } from '@/lib/types/project';

export interface ProjectContextValue {
  project: Project;
  permissions: ProjectPermissions;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export const ProjectProvider: FC<{
  children: ReactNode;
  value: ProjectContextValue;
}> = (props) => (
  <ProjectContext.Provider value={props.value}>{props.children}</ProjectContext.Provider>
);

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}

export function useProject(): Project | null {
  const context = useContext(ProjectContext);
  return context?.project ?? null;
}

/**
 * Hook to get project permissions from context.
 * Throws an error if used outside a ProjectProvider.
 */
export function useProjectPermissions(): ProjectPermissions {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectPermissions must be used within a ProjectProvider');
  }
  return context.permissions;
}

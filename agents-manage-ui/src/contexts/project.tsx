'use client';

import { createContext, type FC, type ReactNode, useContext } from 'react';
import type { Project } from '@/lib/types/project';

const ProjectContext = createContext<Project | null>(null);

export const ProjectProvider: FC<{
  children: ReactNode;
  value: Project;
}> = (props) => <ProjectContext {...props} />;

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used within a <ProjectProvider />');
  }

  return ctx;
}

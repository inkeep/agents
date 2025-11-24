'use client';

import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { Project } from '@/lib/types/project';

type ProjectStateData = {
  project: Project | null;
};

type ProjectActions = {
  setProject(project: Project | null): void;
  reset(): void;
};

type ProjectState = ProjectStateData & {
  actions: ProjectActions;
};

const initialProjectState: ProjectStateData = {
  project: null,
};

const projectState: StateCreator<ProjectState> = (set) => ({
  ...initialProjectState,
  actions: {
    setProject(project) {
      set({ project });
    },
    reset() {
      set(initialProjectState);
    },
  },
});

export const projectStore = create<ProjectState>()(
  devtools(projectState, { name: 'inkeep:project' })
);

/**
 * Actions are functions that update values in your store.
 * These are static and do not change between renders.
 *
 * @see https://tkdodo.eu/blog/working-with-zustand#separate-actions-from-state
 */
export const useProjectActions = () => projectStore((state) => state.actions);

/**
 * Select values from the project store (excluding actions).
 *
 * We explicitly use `ProjectStateData` instead of `ProjectState`,
 * which includes actions, to encourage using `useProjectActions`
 * when accessing or calling actions.
 */
export function useProjectStore<T>(selector: (state: ProjectStateData) => T): T {
  return projectStore(useShallow(selector));
}

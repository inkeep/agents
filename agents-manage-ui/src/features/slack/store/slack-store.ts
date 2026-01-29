'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SlackNotification, SlackWorkspace } from '../types';

interface SlackUIState {
  isConnecting: boolean;
  notification: SlackNotification | null;
}

interface SlackPersistedState {
  workspaces: SlackWorkspace[];
}

interface SlackActions {
  setIsConnecting: (isConnecting: boolean) => void;
  setNotification: (notification: SlackNotification | null) => void;
  clearNotification: () => void;

  addOrUpdateWorkspace: (workspace: SlackWorkspace) => void;
  removeWorkspace: (teamId: string) => void;
  clearAllWorkspaces: () => void;

  getLatestWorkspace: () => SlackWorkspace | null;
}

type SlackStore = SlackUIState & SlackPersistedState & SlackActions;

export const useSlackStore = create<SlackStore>()(
  persist(
    (set, get) => ({
      isConnecting: false,
      notification: null,
      workspaces: [],

      setIsConnecting: (isConnecting) => set({ isConnecting }),

      setNotification: (notification) => set({ notification }),

      clearNotification: () => set({ notification: null }),

      addOrUpdateWorkspace: (workspace) =>
        set((state) => {
          const existingIndex = state.workspaces.findIndex((w) => w.teamId === workspace.teamId);
          if (existingIndex >= 0) {
            const updated = [...state.workspaces];
            updated[existingIndex] = workspace;
            return { workspaces: updated };
          }
          return { workspaces: [...state.workspaces, workspace] };
        }),

      removeWorkspace: (teamId) =>
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.teamId !== teamId),
        })),

      clearAllWorkspaces: () => set({ workspaces: [] }),

      getLatestWorkspace: () => {
        const workspaces = get().workspaces;
        return workspaces.length > 0 ? workspaces[workspaces.length - 1] : null;
      },
    }),
    {
      name: 'inkeep-slack-store',
      partialize: (state) => ({
        workspaces: state.workspaces,
      }),
    }
  )
);

export const useSlackWorkspaces = () =>
  useSlackStore((state) => ({
    workspaces: state.workspaces,
    latestWorkspace: state.getLatestWorkspace(),
    addOrUpdateWorkspace: state.addOrUpdateWorkspace,
    removeWorkspace: state.removeWorkspace,
    clearAllWorkspaces: state.clearAllWorkspaces,
  }));

export const useSlackUI = () =>
  useSlackStore((state) => ({
    isConnecting: state.isConnecting,
    notification: state.notification,
    setIsConnecting: state.setIsConnecting,
    setNotification: state.setNotification,
    clearNotification: state.clearNotification,
  }));

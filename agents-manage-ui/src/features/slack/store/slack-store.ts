'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SlackNotification, SlackUserLink, SlackWorkspace } from '../types';

interface SlackUIState {
  isConnecting: boolean;
  notification: SlackNotification | null;
}

interface SlackPersistedState {
  workspaces: SlackWorkspace[];
  userLinks: SlackUserLink[];
}

interface SlackActions {
  setIsConnecting: (isConnecting: boolean) => void;
  setNotification: (notification: SlackNotification | null) => void;
  clearNotification: () => void;

  addOrUpdateWorkspace: (workspace: SlackWorkspace) => void;
  removeWorkspace: (teamId: string) => void;
  clearAllWorkspaces: () => void;

  addOrUpdateUserLink: (link: SlackUserLink) => void;
  removeUserLink: (appUserId: string) => void;
  clearAllUserLinks: () => void;

  getCurrentUserLink: (userId: string | undefined) => SlackUserLink | undefined;
  getLatestWorkspace: () => SlackWorkspace | null;
}

type SlackStore = SlackUIState & SlackPersistedState & SlackActions;

export const useSlackStore = create<SlackStore>()(
  persist(
    (set, get) => ({
      isConnecting: false,
      notification: null,
      workspaces: [],
      userLinks: [],

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

      addOrUpdateUserLink: (link) =>
        set((state) => {
          const existingIndex = state.userLinks.findIndex((l) => l.appUserId === link.appUserId);
          if (existingIndex >= 0) {
            const updated = [...state.userLinks];
            updated[existingIndex] = { ...link };
            return { userLinks: updated };
          }
          return { userLinks: [...state.userLinks, { ...link }] };
        }),

      removeUserLink: (appUserId) =>
        set((state) => ({
          userLinks: state.userLinks.filter((l) => l.appUserId !== appUserId),
        })),

      clearAllUserLinks: () => set({ userLinks: [] }),

      getCurrentUserLink: (userId) => {
        if (!userId) return undefined;
        return get().userLinks.find((link) => link.appUserId === userId);
      },

      getLatestWorkspace: () => {
        const workspaces = get().workspaces;
        return workspaces.length > 0 ? workspaces[workspaces.length - 1] : null;
      },
    }),
    {
      name: 'inkeep-slack-store',
      partialize: (state) => ({
        workspaces: state.workspaces,
        userLinks: state.userLinks,
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

export const useSlackUserLinks = (currentUserId?: string) =>
  useSlackStore((state) => ({
    userLinks: state.userLinks,
    currentUserLink: state.getCurrentUserLink(currentUserId),
    addOrUpdateUserLink: state.addOrUpdateUserLink,
    removeUserLink: state.removeUserLink,
    clearAllUserLinks: state.clearAllUserLinks,
  }));

export const useSlackUI = () =>
  useSlackStore((state) => ({
    isConnecting: state.isConnecting,
    notification: state.notification,
    setIsConnecting: state.setIsConnecting,
    setNotification: state.setNotification,
    clearNotification: state.clearNotification,
  }));

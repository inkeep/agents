'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SlackUserLink, SlackWorkspace } from '../types';

const WORKSPACES_STORAGE_KEY = 'inkeep_slack_workspaces';
const USER_LINKS_STORAGE_KEY = 'inkeep_slack_user_links';

function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function useSlackWorkspaces() {
  const [workspaces, setWorkspaces] = useState<SlackWorkspace[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setWorkspaces(getFromStorage(WORKSPACES_STORAGE_KEY, []));
  }, []);

  const addOrUpdateWorkspace = useCallback((workspace: SlackWorkspace) => {
    setWorkspaces((prev) => {
      const existingIndex = prev.findIndex((w) => w.teamId === workspace.teamId);
      let updated: SlackWorkspace[];

      if (existingIndex >= 0) {
        updated = [...prev];
        updated[existingIndex] = workspace;
      } else {
        updated = [...prev, workspace];
      }

      saveToStorage(WORKSPACES_STORAGE_KEY, updated);
      return updated;
    });
  }, []);

  const removeWorkspace = useCallback((teamId: string) => {
    setWorkspaces((prev) => {
      const updated = prev.filter((w) => w.teamId !== teamId);
      saveToStorage(WORKSPACES_STORAGE_KEY, updated);
      return updated;
    });
  }, []);

  const clearAllWorkspaces = useCallback(() => {
    setWorkspaces([]);
    saveToStorage(WORKSPACES_STORAGE_KEY, []);
  }, []);

  const refresh = useCallback(() => {
    setWorkspaces(getFromStorage(WORKSPACES_STORAGE_KEY, []));
  }, []);

  const latestWorkspace = workspaces.length > 0 ? workspaces[workspaces.length - 1] : null;

  return {
    workspaces,
    latestWorkspace,
    mounted,
    addOrUpdateWorkspace,
    removeWorkspace,
    clearAllWorkspaces,
    refresh,
  };
}

export function useSlackUserLinks(currentUserId?: string) {
  const [userLinks, setUserLinks] = useState<SlackUserLink[]>([]);
  const [mounted, setMounted] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    setMounted(true);
    setUserLinks(getFromStorage(USER_LINKS_STORAGE_KEY, []));
  }, []);

  const currentUserLink = userLinks.find((link) => link.appUserId === currentUserId);

  const addOrUpdateUserLink = useCallback((link: SlackUserLink) => {
    setUserLinks((prev) => {
      const existingIndex = prev.findIndex((l) => l.appUserId === link.appUserId);
      let updated: SlackUserLink[];

      if (existingIndex >= 0) {
        updated = [...prev];
        updated[existingIndex] = { ...link };
      } else {
        updated = [...prev, { ...link }];
      }

      saveToStorage(USER_LINKS_STORAGE_KEY, updated);
      return updated;
    });
    forceUpdate((v) => v + 1);
  }, []);

  const removeUserLink = useCallback((appUserId: string) => {
    setUserLinks((prev) => {
      const updated = prev.filter((l) => l.appUserId !== appUserId);
      saveToStorage(USER_LINKS_STORAGE_KEY, updated);
      return updated;
    });
  }, []);

  const clearAllUserLinks = useCallback(() => {
    setUserLinks([]);
    saveToStorage(USER_LINKS_STORAGE_KEY, []);
  }, []);

  const refresh = useCallback(() => {
    setUserLinks(getFromStorage(USER_LINKS_STORAGE_KEY, []));
  }, []);

  return {
    userLinks,
    currentUserLink,
    mounted,
    addOrUpdateUserLink,
    removeUserLink,
    clearAllUserLinks,
    refresh,
  };
}

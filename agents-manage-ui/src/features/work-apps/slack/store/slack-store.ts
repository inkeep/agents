'use client';

import { create } from 'zustand';
import type { SlackNotification } from '../types';

interface SlackUIState {
  isConnecting: boolean;
  notification: SlackNotification | null;
}

interface SlackActions {
  setIsConnecting: (isConnecting: boolean) => void;
  setNotification: (notification: SlackNotification | null) => void;
  clearNotification: () => void;
}

type SlackStore = SlackUIState & SlackActions;

export const useSlackStore = create<SlackStore>()((set) => ({
  isConnecting: false,
  notification: null,

  setIsConnecting: (isConnecting) => set({ isConnecting }),

  setNotification: (notification) => set({ notification }),

  clearNotification: () => set({ notification: null }),
}));

'use client';

import { create } from 'zustand';
import type { SlackNotification } from '../types';

interface SlackUIState {
  notification: SlackNotification | null;
}

interface SlackActions {
  setNotification: (notification: SlackNotification | null) => void;
  clearNotification: () => void;
}

type SlackStore = SlackUIState & SlackActions;

export const useSlackStore = create<SlackStore>()((set) => ({
  notification: null,

  setNotification: (notification) => set({ notification }),

  clearNotification: () => set({ notification: null }),
}));

'use client';

import { createContext, use } from 'react';
import type { RuntimeConfig } from '@/lib/runtime-config/types';

const Ctx = createContext<RuntimeConfig | null>(null);

export const RuntimeConfigProvider = Ctx;

export function useRuntimeConfig() {
  const ctx = use(Ctx);
  if (!ctx) {
    throw new Error('useRuntimeConfig must be used within a <RuntimeConfigProvider />');
  }
  return ctx;
}

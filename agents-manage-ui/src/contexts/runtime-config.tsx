'use client';

import { createContext, use } from 'react';
import type { getRuntimeConfig } from '@/lib/runtime-config/get-runtime-config';

const Ctx = createContext<ReturnType<typeof getRuntimeConfig> | null>(null);

export const RuntimeConfigProvider = Ctx;

export function useRuntimeConfig() {
  const ctx = use(Ctx);
  if (!ctx) {
    throw new Error('useRuntimeConfig must be used within a <RuntimeConfigProvider />');
  }
  return ctx;
}

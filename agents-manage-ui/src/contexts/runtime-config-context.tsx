// components/RuntimeConfigContext.tsx
'use client';

import type React from 'react';
import { createContext, useContext } from 'react';
import type { RuntimeConfig } from '@/lib/runtime-config/types';

const Ctx = createContext<RuntimeConfig | null>(null);

export function RuntimeConfigProvider({
  value,
  children,
}: {
  value: RuntimeConfig;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRuntimeConfig() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRuntimeConfig must be used within <RuntimeConfigProvider>');
  return ctx;
}

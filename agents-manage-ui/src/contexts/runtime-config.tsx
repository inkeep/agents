// components/RuntimeConfigContext.tsx
'use client';

import type React from 'react';
import { createContext, use } from 'react';
import type { RuntimeConfig } from '@/lib/runtime-config/types';

const Ctx = createContext<RuntimeConfig | null>(null);

export function RuntimeConfigProvider({
  value,
  children,
}: {
  value: RuntimeConfig;
  children: React.ReactNode;
}) {
  return <Ctx value={value}>{children}</Ctx>;
}

export function useRuntimeConfig() {
  const ctx = use(Ctx);
  if (!ctx) {
    throw new Error('useRuntimeConfig must be used within a <RuntimeConfigProvider />');
  }
  return ctx;
}

'use client';

import { createContext, use } from 'react';
import type { FullAgentUpdateSchema } from '@/lib/validation';
import type { z } from 'zod';
import type { UseFormReturn } from 'react-hook-form';

type Input = z.input<typeof FullAgentUpdateSchema>;
type Output = z.output<typeof FullAgentUpdateSchema>;

export const FullAgentFormContext = createContext<UseFormReturn<Input, any, Output> | null>(null);

export function useFullAgentFormContext() {
  const ctx = use(FullAgentFormContext);
  if (!ctx) {
    throw new Error('useFullAgentFormContext must be used within <FullAgentFormContext />');
  }
  return ctx;
}

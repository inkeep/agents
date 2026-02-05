'use client';

import { createContext, type FC, type ReactNode, use } from 'react';
import { useForm, type UseFormReturn, type DefaultValues } from 'react-hook-form';
import type { z } from 'zod';
import { FullAgentUpdateSchema } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';

type Input = z.input<typeof FullAgentUpdateSchema>;
type Output = z.output<typeof FullAgentUpdateSchema>;

const FullAgentFormContext = createContext<UseFormReturn<Input, unknown, Output> | null>(null);

const resolver = zodResolver(FullAgentUpdateSchema);

export const FullAgentFormProvider: FC<{
  children: ReactNode;
  defaultValues: DefaultValues<Input>;
}> = ({ defaultValues, children }) => {
  'use memo';
  const form = useForm({
    defaultValues,
    resolver,
  });
  return <FullAgentFormContext value={form}>{children}</FullAgentFormContext>;
};

export function useFullAgentFormContext() {
  const ctx = use(FullAgentFormContext);
  if (!ctx) {
    throw new Error('useFullAgentFormContext must be used within <FullAgentFormContext />');
  }
  return ctx;
}

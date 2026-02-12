'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createContext, type FC, type ReactNode, use } from 'react';
import { type UseFormReturn, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Form } from '@/components/ui/form';
import { FullAgentUpdateSchema } from '@/lib/types/agent-full';

type Input = z.input<typeof FullAgentUpdateSchema>;
type Output = z.output<typeof FullAgentUpdateSchema>;

const resolver = zodResolver(FullAgentUpdateSchema);
const FullAgentFormContext = createContext<UseFormReturn<Input, unknown, Output> | null>(null);

export const FullAgentFormProvider: FC<{
  children: ReactNode;
  defaultValues: Input;
}> = ({ defaultValues, children }) => {
  'use memo';

  const form = useForm({
    defaultValues,
    resolver,
    mode: 'onChange',
  });

  return (
    <Form {...form}>
      <FullAgentFormContext value={form}>{children}</FullAgentFormContext>
    </Form>
  );
};

export function useFullAgentFormContext() {
  const ctx = use(FullAgentFormContext);
  if (!ctx) {
    throw new Error('useFullAgentFormContext must be used within a <FullAgentFormProvider />');
  }
  return ctx;
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createContext, type FC, type ReactNode, use, useEffect } from 'react';
import { type UseFormReturn, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FullAgentFormSchema } from '@/components/agent/form/validation';
import { Form } from '@/components/ui/form';

type Input = z.input<typeof FullAgentFormSchema>;
type Output = z.output<typeof FullAgentFormSchema>;

const resolver = zodResolver(FullAgentFormSchema);
const FullAgentFormContext = createContext<UseFormReturn<Input, unknown, Output> | null>(null);

export const FullAgentFormProvider: FC<{
  children: ReactNode;
  defaultValues: Input;
}> = ({ defaultValues, children }) => {
  const form = useForm({
    defaultValues,
    resolver,
    mode: 'onChange',
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: validate initial data on mount to surface pre-existing issues (e.g. missing default sub agent)
  useEffect(() => {
    form.trigger();
  }, []);

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

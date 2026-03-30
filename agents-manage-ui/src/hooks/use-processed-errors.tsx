'use client';

import { useFormState } from 'react-hook-form';
import { flatNestedFieldMessage } from '@/components/ui/form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';

export function useProcessedErrors(
  entity:
    | 'subAgents'
    | 'externalAgents'
    | 'teamAgents'
    | 'functionTools'
    | 'functions'
    | 'tools'
    | 'mcpRelations',
  key: string
): Array<{
  field: string;
  message?: string;
}> {
  // React Hook Form uses a Proxy for formState,
  // so the errors object may not get a new reference on updates with React compiler
  const { control } = useFullAgentFormContext();
  const { errors } = useFormState({ control, name: `${entity}.${key}` });

  const fieldErrors = errors?.[entity]?.[key] ?? {};
  const processedErrors = Object.entries(fieldErrors).map(([key, value]) => ({
    field: key,
    message: flatNestedFieldMessage(value),
  }));

  return processedErrors;
}

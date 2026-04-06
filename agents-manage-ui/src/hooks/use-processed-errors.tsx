'use client';

import { useFormState } from 'react-hook-form';
import { flatNestedFieldMessage } from '@/components/ui/form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';

type Entity =
  | 'subAgents'
  | 'externalAgents'
  | 'teamAgents'
  | 'functionTools'
  | 'functions'
  | 'tools'
  | 'mcpRelations';

export function useProcessedErrors(
  entity: Entity,
  key: string
): Array<{
  field: string;
  message?: string;
}> {
  const { control } = useFullAgentFormContext();
  const name = `${entity}.${key}` as const;
  const formState = useFormState({ control, name });
  const { error = {} } = control.getFieldState(name, formState);

  const processedErrors = Object.entries(error).map(([key, value]) => ({
    field: key,
    message: flatNestedFieldMessage(value),
  }));

  return processedErrors;
}

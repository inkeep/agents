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

function useErrors(entity: Entity, key: string) {
  'use no memo';

  // Read field errors inside a no-memo boundary because RHF may update its
  // proxy-backed form state without replacing nested error object references.
  const { control } = useFullAgentFormContext();
  const { errors } = useFormState({ control, name: `${entity}.${key}` });
  const fieldErrors = errors?.[entity]?.[key] ?? {};

  return fieldErrors;
}

export function useProcessedErrors(
  entity: Entity,
  key: string
): Array<{
  field: string;
  message?: string;
}> {
  const fieldErrors = useErrors(entity, key);

  const processedErrors = Object.entries(fieldErrors).map(([key, value]) => ({
    field: key,
    message: flatNestedFieldMessage(value),
  }));

  return processedErrors;
}

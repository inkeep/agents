import { useFormState } from 'react-hook-form';
import { firstNestedMessage } from '@/components/ui/form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';

export function useProcessedErrors(
  entity: 'subAgents' | 'externalAgents' | 'teamAgents' | 'functionTools',
  key: string
): Array<{
  field: string;
  message?: string;
}> {
  const { control } = useFullAgentFormContext();
  const { errors } = useFormState({
    control,
    name: `${entity}.${key}`,
  });
  const fieldErrors = errors?.[entity]?.[key];
  const processedErrors = fieldErrors
    ? Object.entries(fieldErrors).map(([key, value]) => ({
        field: key,
        message: firstNestedMessage(value),
      }))
    : [];

  return processedErrors;
}

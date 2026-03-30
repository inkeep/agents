import type { FullAgentFormValues } from '@/components/agent/form/validation';

type FunctionToolFormData = NonNullable<FullAgentFormValues['functionTools']>;

export function getFunctionIdForTool(
  toolId?: string | null,
  functionToolFormData?: FunctionToolFormData
): string | undefined {
  if (!toolId) {
    return;
  }

  return functionToolFormData?.[toolId]?.functionId ?? toolId;
}

export function findFunctionToolIdsForFunctionId(
  functionId?: string | null,
  functionToolFormData?: FunctionToolFormData
): string[] {
  if (!functionId || !functionToolFormData) {
    return [];
  }

  return Object.entries(functionToolFormData)
    .filter(([, functionTool]) => (functionTool.functionId ?? '') === functionId)
    .map(([toolId]) => toolId);
}

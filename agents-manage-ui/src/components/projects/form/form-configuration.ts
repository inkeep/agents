import type { ProjectFormData } from './validation';

export const defaultValues: ProjectFormData = {
  id: '',
  name: '',
  description: '',
  models: {
    base: undefined,
    structuredOutput: undefined,
    summarizer: undefined,
  },
  stopWhen: {
    transferCountIs: undefined,
    stepCountIs: undefined,
  },
};

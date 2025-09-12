import {
  DEFAULT_BASE_MODEL,
  DEFAULT_STRUCTURED_OUTPUT_MODEL,
  DEFAULT_SUMMARIZER_MODEL,
} from '@/components/graph/configuration/model-options';
import type { ProjectFormData } from './validation';

export const defaultValues: ProjectFormData = {
  id: '',
  name: '',
  description: '',
  models: {
    base: {
      model: DEFAULT_BASE_MODEL,
      providerOptions: {},
    },
    structuredOutput: {
      model: DEFAULT_STRUCTURED_OUTPUT_MODEL,
      providerOptions: undefined,
    },
    summarizer: {
      model: DEFAULT_SUMMARIZER_MODEL,
      providerOptions: undefined,
    },
  },
  stopWhen: {
    transferCountIs: undefined,
    stepCountIs: undefined,
  },
};

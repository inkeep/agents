import {
  DEFAULT_BASE_MODEL,
  DEFAULT_STRUCTURED_OUTPUT_MODEL,
  DEFAULT_SUMMARIZER_MODEL,
} from '@/components/agent/configuration/model-options';
import type { ProjectFormData } from './validation';

export const defaultValues: ProjectFormData = {
  id: '',
  name: '',
  description: '',
  models: {
    base: {
      model: DEFAULT_BASE_MODEL,
      providerOptions: undefined,
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
  stopWhen: undefined,
};

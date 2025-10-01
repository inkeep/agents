import {
  DEFAULT_ANTHROPIC_BASE_MODEL,
  DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
  DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
} from '@/components/graph/configuration/model-options';
import type { ProjectFormData } from './validation';

export const defaultValues: ProjectFormData = {
  id: '',
  name: '',
  description: '',
  models: {
    base: {
      model: DEFAULT_ANTHROPIC_BASE_MODEL,
      providerOptions: null,
    },
    structuredOutput: {
      model: DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
      providerOptions: null,
    },
    summarizer: {
      model: DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
      providerOptions: null,
    },
  },
  stopWhen: {},
};

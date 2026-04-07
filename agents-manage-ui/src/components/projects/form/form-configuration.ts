import {
  DEFAULT_ANTHROPIC_BASE_MODEL,
  DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
  DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
} from '@/components/agent/configuration/model-options';
import type { ProjectFormInputValues } from './validation';

export const defaultValues: ProjectFormInputValues = {
  id: '',
  name: '',
  description: '',
  models: {
    base: {
      model: DEFAULT_ANTHROPIC_BASE_MODEL,
      providerOptions: '',
    },
    structuredOutput: {
      model: DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
      providerOptions: '',
    },
    summarizer: {
      model: DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
      providerOptions: '',
    },
  },
};

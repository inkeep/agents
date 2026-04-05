import {
  DEFAULT_ANTHROPIC_BASE_MODEL,
  DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
  DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
} from '@/components/agent/configuration/model-options';
import type { ProjectInput } from './validation';

export const defaultValues: ProjectInput = {
  id: '',
  name: '',
  description: '',
  models: {
    base: {
      model: DEFAULT_ANTHROPIC_BASE_MODEL,
    },
    structuredOutput: {
      model: DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
    },
    summarizer: {
      model: DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
    },
  },
};

import {
  DEFAULT_ANTHROPIC_BASE_MODEL,
  DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
  DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
} from '@/components/agent/configuration/model-options';
import type { ProjectFormData } from './validation';

export const defaultValues: ProjectFormData = {
  id: '',
  name: '',
  description: '',
  models: {
    base: {
      model: DEFAULT_ANTHROPIC_BASE_MODEL,
      providerOptions: undefined,
    },
    structuredOutput: {
      model: DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL,
      providerOptions: undefined,
    },
    summarizer: {
      model: DEFAULT_ANTHROPIC_SUMMARIZER_MODEL,
      providerOptions: undefined,
    },
  },
  stopWhen: undefined,
  sandboxConfig: {
    provider: 'local',
    runtime: 'node22',
    timeout: 30000,
    vcpus: 1,
  },
};

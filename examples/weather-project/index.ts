import { project } from '@inkeep/agents-sdk';
import { weatherAdvanced } from './agents/weather-advanced';
import { weatherBasic } from './agents/weather-basic';
import { weatherIntermediate } from './agents/weather-intermediate';

export const weatherProject = project({
  id: `weather-project`,
  name: `Weather Project`,
  description: `Weather project template`,
  models: {
    base: {
      model: `anthropic/claude-sonnet-4-5-20250929`
    },
    structuredOutput: {
      model: `anthropic/claude-sonnet-4-5-20250929`
    },
    summarizer: {
      model: `anthropic/claude-sonnet-4-5-20250929`
    }
  },
  agents: () => [weatherBasic, weatherAdvanced, weatherIntermediate]
});
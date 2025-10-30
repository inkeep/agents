/**
 * Model Provider Detector - Detect available API keys and select appropriate models
 */

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

interface SimpleProviderConfig {
  name: string;
  envVars: string[];
  model: string;
}

const PROVIDER_CONFIGS: SimpleProviderConfig[] = [
  {
    name: 'anthropic',
    envVars: ['ANTHROPIC_API_KEY'],
    model: 'claude-sonnet-4-5'
  },
  {
    name: 'openai',
    envVars: ['OPENAI_API_KEY'], 
    model: 'gpt-4.1'
  },
  {
    name: 'google',
    envVars: ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    model: 'gemini-2.5-flash'
  }
];

/**
 * Get a model instance for LLM content merging
 * Returns first available provider or throws if none available
 */
export function getAvailableModel(): any {
  for (const config of PROVIDER_CONFIGS) {
    const hasKey = config.envVars.some(envVar => {
      const value = process.env[envVar];
      return value && value.trim() !== '';
    });
    
    if (hasKey) {
      switch (config.name) {
        case 'anthropic':
          return anthropic(config.model);
        case 'openai':
          return openai(config.model);
        case 'google':
          return google(config.model);
        default:
          throw new Error(`Unknown provider: ${config.name}`);
      }
    }
  }
  
  throw new Error('No API keys detected. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY');
}
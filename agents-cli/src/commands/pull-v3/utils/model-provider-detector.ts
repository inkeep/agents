/**
 * Model Provider Detector - Detect available API keys and select appropriate models
 */

interface ModelConfig {
  base: {
    model: string;
    providerOptions?: any;
  };
  structuredOutput?: {
    model: string;
    providerOptions?: any;
  };
  summarizer?: {
    model: string;
    providerOptions?: any;
  };
}

interface ProviderConfig {
  name: string;
  envVars: string[];
  models: ModelConfig;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    name: 'anthropic',
    envVars: ['ANTHROPIC_API_KEY'],
    models: {
      base: {
        model: 'claude-3-5-sonnet-20241022'
      },
      structuredOutput: {
        model: 'claude-3-5-sonnet-20241022'
      },
      summarizer: {
        model: 'claude-3-5-haiku-20241022'
      }
    }
  },
  {
    name: 'openai',
    envVars: ['OPENAI_API_KEY'],
    models: {
      base: {
        model: 'gpt-4o'
      },
      structuredOutput: {
        model: 'gpt-4o'
      },
      summarizer: {
        model: 'gpt-4o-mini'
      }
    }
  },
  {
    name: 'google',
    envVars: ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    models: {
      base: {
        model: 'gemini-1.5-pro'
      },
      structuredOutput: {
        model: 'gemini-1.5-pro'
      },
      summarizer: {
        model: 'gemini-1.5-flash'
      }
    }
  }
];

/**
 * Check if any of the environment variables for a provider are set
 */
function hasProviderApiKey(provider: ProviderConfig): boolean {
  return provider.envVars.some(envVar => {
    const value = process.env[envVar];
    return value && value.trim() !== '';
  });
}

/**
 * Detect the first available provider based on API key availability
 */
export function detectAvailableProvider(): ProviderConfig | null {
  for (const provider of PROVIDER_CONFIGS) {
    if (hasProviderApiKey(provider)) {
      return provider;
    }
  }
  return null;
}

/**
 * Get all available providers
 */
export function getAllAvailableProviders(): ProviderConfig[] {
  return PROVIDER_CONFIGS.filter(hasProviderApiKey);
}

/**
 * Get default models based on available API keys
 * Returns the first available provider's model configuration
 */
export function getDefaultModels(): ModelConfig | null {
  const provider = detectAvailableProvider();
  return provider ? provider.models : null;
}

/**
 * Get model configuration with fallback logic
 * If no API keys are found, returns Claude models as fallback
 */
export function getModelsWithFallback(): ModelConfig {
  const detectedModels = getDefaultModels();
  
  if (detectedModels) {
    return detectedModels;
  }
  
  // Fallback to Claude models (most common case)
  return PROVIDER_CONFIGS[0].models;
}

/**
 * Log detected providers for debugging
 */
export function logDetectedProviders(debug: boolean = false): void {
  if (!debug) return;
  
  const availableProviders = getAllAvailableProviders();
  
  if (availableProviders.length === 0) {
    console.log('⚠️  No API keys detected. Using default Claude models.');
    console.log('   Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY');
    return;
  }
  
  console.log(`🔑 Detected API keys for: ${availableProviders.map(p => p.name).join(', ')}`);
  
  const selectedProvider = availableProviders[0];
  console.log(`📋 Using ${selectedProvider.name} models:`);
  console.log(`   Base: ${selectedProvider.models.base.model}`);
  console.log(`   Structured: ${selectedProvider.models.structuredOutput?.model || 'same as base'}`);
  console.log(`   Summarizer: ${selectedProvider.models.summarizer?.model || 'same as base'}`);
}

/**
 * Check if a specific provider is available
 */
export function isProviderAvailable(providerName: string): boolean {
  const provider = PROVIDER_CONFIGS.find(p => p.name === providerName);
  return provider ? hasProviderApiKey(provider) : false;
}

/**
 * Get provider priority order (for informational purposes)
 */
export function getProviderPriority(): string[] {
  return PROVIDER_CONFIGS.map(p => p.name);
}
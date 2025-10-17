/**
 * OpenTelemetry instrumentation setup for Langfuse
 * This file sets up LLM observability for the CLI using Langfuse
 *
 * Initialization happens automatically when this file is imported
 * in the entry point (index.ts), before any AI SDK calls are made.
 */

import { registerOTel } from '@vercel/otel';
import { LangfuseExporter } from 'langfuse-vercel';

// Load environment configuration first
// Note: We need to check env vars directly since this runs before env.ts parsing
const langfuseEnabled = process.env.LANGFUSE_ENABLED === 'true';
const langfuseSecretKey = process.env.LANGFUSE_SECRET_KEY;
const langfusePublicKey = process.env.LANGFUSE_PUBLIC_KEY;

/**
 * Check if Langfuse is properly configured
 */
export function isLangfuseConfigured(): boolean {
  return !!(langfuseEnabled && langfuseSecretKey && langfusePublicKey);
}

/**
 * Initialize OpenTelemetry with Langfuse exporter
 * This will be called automatically when the module is imported
 */
export function initializeInstrumentation(): void {
  // Only initialize if Langfuse is enabled and properly configured
  if (!isLangfuseConfigured()) {
    if (process.env.DEBUG) {
      console.log('[Langfuse] Tracing disabled - missing configuration');
    }
    return;
  }

  try {
    registerOTel({
      serviceName: 'inkeep-agents-cli',
      traceExporter: new LangfuseExporter({
        secretKey: langfuseSecretKey,
        publicKey: langfusePublicKey,
        baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
      }),
    });

    if (process.env.DEBUG) {
      console.log('[Langfuse] Tracing initialized successfully');
    }
  } catch (error) {
    console.warn('[Langfuse] Failed to initialize tracing:', error);
  }
}

// Auto-initialize when the module is imported
initializeInstrumentation();

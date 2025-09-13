/**
 * Development Environment Validation
 *
 * Validates environment variables required for development environment.
 */

import { z } from 'zod';

const developmentEnvSchema = z.object({
  // Development uses memory store with env vars
  INKEEP_API_KEY_DEV: z.string().min(1, 'INKEEP_API_KEY_DEV is required for development'),
});

const parseEnv = () => {
  try {
    return developmentEnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const failedVars = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      const varList = failedVars.map((v) => v.path).join(', ');
      const detailList = failedVars.map((v) => `  ${v.path}: ${v.message}`).join('\n');

      throw new Error(
        `❌ Environment validation failed for DEVELOPMENT: ${varList}\n\n` +
          `Issues found:\n${detailList}\n\n` +
          `Please check your .env file.`
      );
    }
    throw error;
  }
};

// Only validate if we're in development, but always export
export const env =
  process.env.NODE_ENV === 'development' || !process.env.NODE_ENV ? parseEnv() : undefined;

export type DevelopmentEnv = z.infer<typeof developmentEnvSchema>;

/**
 * Production Environment Validation
 *
 * Validates environment variables required for production environment.
 */

import { z } from 'zod';

const productionEnvSchema = z.object({
  // Production uses different API key
  INKEEP_API_KEY_PROD: z.string().min(1, 'INKEEP_API_KEY_PROD is required for production'),
});

const parseEnv = () => {
  try {
    return productionEnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const failedVars = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      const varList = failedVars.map((v) => v.path).join(', ');
      const detailList = failedVars.map((v) => `  ${v.path}: ${v.message}`).join('\n');

      throw new Error(
        `❌ Environment validation failed for PRODUCTION: ${varList}\n\n` +
          `Issues found:\n${detailList}\n\n` +
          `Please check your .env file.`
      );
    }
    throw error;
  }
};

// Only validate if we're in production, but always export
export const env = process.env.NODE_ENV === 'production' ? parseEnv() : undefined;

export type ProductionEnv = z.infer<typeof productionEnvSchema>;

// Environment validation schema
import { z } from 'zod';

// Define your environment validation schema
export const envSchema = z.object({
  // Add validation rules for your credentials
  // Example:
  // apiKey: z.string().min(1, 'API Key is required')
});

// Type for validated environment
export type ValidatedEnv = z.infer<typeof envSchema>;

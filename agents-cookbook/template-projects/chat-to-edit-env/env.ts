import { z } from 'zod';

const envSchema = z.object({
  INKEEP_AGENTS_MANAGE_API_URL: z.url().optional().default('http://127.0.0.1:3002'),
  INKEEP_AGENTS_RUN_API_URL: z.url().optional().default('http://127.0.0.1:3002'),
  INKEEP_AGENTS_DOCS_URL: z.url().optional().default('http://localhost:3010'),
});
export const env = envSchema.parse(process.env);

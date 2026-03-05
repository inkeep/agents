import { z } from 'zod';

const booleanString = z
  .string()
  .optional()
  .transform((val) => (val == null ? undefined : val === 'true' || val === '1'));

export const emailEnvSchema = z.object({
  RESEND_API_KEY: z
    .string()
    .optional()
    .describe('Resend API key for SMTP relay (takes priority over generic SMTP)'),

  SMTP_HOST: z
    .string()
    .optional()
    .describe('SMTP server hostname (e.g., smtp.gmail.com, localhost)'),

  SMTP_PORT: z.coerce
    .number()
    .optional()
    .describe('SMTP server port (e.g., 465 for SSL, 587 for TLS, 1025 for Mailpit)'),

  SMTP_USER: z.string().optional().describe('SMTP authentication username'),

  SMTP_PASSWORD: z.string().optional().describe('SMTP authentication password'),

  SMTP_SECURE: booleanString.describe(
    'Use TLS/SSL for SMTP connection (auto-detected from port if not set)'
  ),

  SMTP_FROM_ADDRESS: z
    .string()
    .optional()
    .describe('Email from address (e.g., notifications@updates.inkeep.com)'),

  SMTP_FROM_NAME: z.string().optional().describe('Email from display name (e.g., Inkeep)'),

  SMTP_REPLY_TO: z
    .string()
    .optional()
    .describe('Reply-to email address (defaults to from address)'),
});

export type EmailEnv = z.infer<typeof emailEnvSchema>;

export function parseEmailEnv(env: Record<string, string | undefined> = process.env): EmailEnv {
  return emailEnvSchema.parse(env);
}

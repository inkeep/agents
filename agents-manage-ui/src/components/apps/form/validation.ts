import { z } from 'zod';

const AUTH_MODE_ENUM = [
  'anonymous_only',
  'anonymous_and_authenticated',
  'authenticated_only',
] as const;

const AGENT_ACCESS_MODE_ENUM = ['all', 'selected'] as const;

export const AUTH_MODE_OPTIONS = [
  { value: 'anonymous_only', label: 'Anonymous only' },
  { value: 'anonymous_and_authenticated', label: 'Anonymous & Authenticated' },
  { value: 'authenticated_only', label: 'Authenticated only' },
] as const;

export const AGENT_ACCESS_MODE_OPTIONS = [
  { value: 'all', label: 'All agents' },
  { value: 'selected', label: 'Selected agents' },
] as const;

export const APP_TYPE_OPTIONS = [
  {
    value: 'web_client' as const,
    label: 'Web Client',
    description: 'For embedding chat widgets on your website',
  },
  {
    value: 'api' as const,
    label: 'API',
    description: 'For server-to-server API access',
  },
] as const;

export const AppCreateFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  agentAccessMode: z.enum(AGENT_ACCESS_MODE_ENUM),
  allowedAgentIds: z.array(z.string()),
  defaultAgentId: z.string().optional(),
  allowedDomains: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        const domains = val
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);
        return domains.length >= 1;
      },
      { message: 'At least one domain is required for web client apps' }
    ),
  authMode: z.enum(AUTH_MODE_ENUM).optional(),
  captchaEnabled: z.boolean().optional(),
});

export const AppUpdateFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  agentAccessMode: z.enum(AGENT_ACCESS_MODE_ENUM),
  allowedAgentIds: z.array(z.string()),
  defaultAgentId: z.string().optional(),
  enabled: z.boolean(),
  allowedDomains: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        const domains = val
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean);
        return domains.length >= 1;
      },
      { message: 'At least one domain is required for web client apps' }
    ),
  authMode: z.enum(AUTH_MODE_ENUM).optional(),
  captchaEnabled: z.boolean().optional(),
});

export type AppCreateFormInput = z.infer<typeof AppCreateFormSchema>;
export type AppUpdateFormInput = z.infer<typeof AppUpdateFormSchema>;

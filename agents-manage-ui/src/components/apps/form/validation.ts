import { ALLOWED_DOMAIN_PATTERN } from '@inkeep/agents-core';
import { z } from 'zod';

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

function validateDomainList(val: string | undefined) {
  if (val === undefined) return true;
  const domains = val
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  if (domains.length < 1) return false;
  return domains.every((d) => ALLOWED_DOMAIN_PATTERN.test(d));
}

const DOMAIN_VALIDATION_MESSAGE =
  'Enter valid domains separated by commas (e.g. "example.com, *.example.com"). At least one domain is required for web client apps.';

export const AppCreateFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  defaultAgentId: z.string().optional(),
  allowedDomains: z
    .string()
    .optional()
    .refine(validateDomainList, { message: DOMAIN_VALIDATION_MESSAGE }),
});

export const AppUpdateFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  defaultAgentId: z.string().optional(),
  enabled: z.boolean(),
  allowedDomains: z
    .string()
    .optional()
    .refine(validateDomainList, { message: DOMAIN_VALIDATION_MESSAGE }),
});

export type AppCreateFormInput = z.infer<typeof AppCreateFormSchema>;
export type AppUpdateFormInput = z.infer<typeof AppUpdateFormSchema>;

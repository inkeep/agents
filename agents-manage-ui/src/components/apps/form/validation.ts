import { ALLOWED_DOMAIN_PATTERN } from '@inkeep/agents-core/client-exports';
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
  {
    value: 'support_copilot' as const,
    label: 'Support Copilot',
    description: 'For deploying agents across external tools and support platforms',
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

const webClientFields = {
  allowedDomains: z
    .string()
    .optional()
    .refine(validateDomainList, { message: DOMAIN_VALIDATION_MESSAGE }),
  audience: z.string().optional(),
};

import { SUPPORT_COPILOT_PLATFORMS } from '@inkeep/agents-core/client-exports';

export const SUPPORT_COPILOT_PLATFORM_OPTIONS = SUPPORT_COPILOT_PLATFORMS.map((p) => ({
  value: p.slug,
  label: p.label,
}));

const PLATFORM_SLUGS = SUPPORT_COPILOT_PLATFORMS.map((p) => p.slug) as [
  (typeof SUPPORT_COPILOT_PLATFORMS)[number]['slug'],
  ...(typeof SUPPORT_COPILOT_PLATFORMS)[number]['slug'][],
];

const supportCopilotQuickActionSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or less'),
  prompt: z
    .string()
    .min(1, 'User message is required')
    .max(4000, 'User message must be 4000 characters or less'),
});

const supportCopilotQuickActionGroupSchema = z.object({
  group: z
    .string()
    .min(1, 'Group name is required')
    .max(100, 'Group name must be 100 characters or less'),
  actions: z.array(supportCopilotQuickActionSchema).min(1, 'At least one action is required'),
});

export type SupportCopilotQuickActionGroupFormInput = z.infer<
  typeof supportCopilotQuickActionGroupSchema
>;

export const DEFAULT_SUPPORT_COPILOT_QUICK_ACTIONS: SupportCopilotQuickActionGroupFormInput[] = [
  {
    group: 'Analyze',
    actions: [
      { label: 'Smart Assist', prompt: 'Run Smart Assist on this ticket' },
      { label: 'Summarize thread', prompt: 'Summarize this thread' },
      { label: 'Draft reply', prompt: 'Draft a reply for this ticket' },
    ],
  },
];

const supportCopilotFields = {
  supportCopilotPlatform: z.enum(PLATFORM_SLUGS).optional(),
  supportCopilotCredentialReferenceId: z.string().optional(),
  supportCopilotQuickActions: z.array(supportCopilotQuickActionGroupSchema).optional(),
};

export function refineSupportCopilotFields(
  data: {
    supportCopilotPlatform?: (typeof PLATFORM_SLUGS)[number];
    supportCopilotCredentialReferenceId?: string;
  },
  ctx: z.RefinementCtx
) {
  if (!data.supportCopilotPlatform) {
    ctx.addIssue({
      code: 'custom',
      path: ['supportCopilotPlatform'],
      message: 'Platform is required',
    });
    return;
  }
  const entry = SUPPORT_COPILOT_PLATFORMS.find((p) => p.slug === data.supportCopilotPlatform);
  if (entry?.credentialRequired && !data.supportCopilotCredentialReferenceId) {
    ctx.addIssue({
      code: 'custom',
      path: ['supportCopilotCredentialReferenceId'],
      message: 'Credential is required for this platform',
    });
  }
}

export const AppCreateFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  defaultAgentId: z.string().min(1, 'Default agent is required'),
  prompt: z.string().optional(),
  ...webClientFields,
  ...supportCopilotFields,
});

export const AppUpdateFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  defaultAgentId: z.string().min(1, 'Default agent is required'),
  prompt: z.string().optional(),
  enabled: z.boolean(),
  ...webClientFields,
  ...supportCopilotFields,
});

export type AppCreateFormInput = z.infer<typeof AppCreateFormSchema>;
export type AppUpdateFormInput = z.infer<typeof AppUpdateFormSchema>;

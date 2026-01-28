import { z } from 'zod';

/**
 * Common deployment object shared across Vercel webhook events.
 * Contains core deployment information that Vercel sends in all deployment-related webhooks.
 */
export const VercelDeploymentSchema = z.object({
  id: z.string().describe('Unique deployment ID'),
  name: z.string().describe('Project name'),
  url: z.string().describe('Deployment URL without protocol'),
  inspectorUrl: z.string().optional().describe('Inspector URL for debugging'),
  meta: z.record(z.string(), z.string()).optional().describe('Metadata key-value pairs'),
  target: z.enum(['production', 'preview']).nullable().describe('Deployment target environment'),
  projectId: z.string().optional().describe('Project ID'),
});

/**
 * Base webhook payload structure common to all Vercel webhook events.
 */
const BaseWebhookSchema = z.object({
  id: z.string().describe('Unique webhook event ID'),
  createdAt: z.number().describe('Unix timestamp in milliseconds when the event was created'),
  region: z.string().optional().describe('Region where the deployment was created'),
  teamId: z.string().nullable().optional().describe('Team ID if deployment belongs to a team'),
  userId: z.string().optional().describe('User ID who triggered the deployment'),
});

/**
 * Payload for deployment.created webhook event.
 * Triggered when a new deployment is created on Vercel.
 */
export const DeploymentCreatedPayloadSchema = z.object({
  deployment: VercelDeploymentSchema,
  links: z
    .object({
      deployment: z.string().optional(),
      project: z.string().optional(),
    })
    .optional()
    .describe('Related resource links'),
  plan: z.string().optional().describe('Vercel plan type (hobby, pro, enterprise)'),
  project: z
    .object({
      id: z.string(),
    })
    .optional()
    .describe('Project reference'),
});

/**
 * Webhook event for deployment.created.
 * Sent when a new deployment is initiated.
 */
export const DeploymentCreatedWebhookSchema = BaseWebhookSchema.extend({
  type: z.literal('deployment.created'),
  payload: DeploymentCreatedPayloadSchema,
});

/**
 * Payload for deployment.ready webhook event.
 * Triggered when a deployment finishes building and is ready to serve traffic.
 */
export const DeploymentReadyPayloadSchema = z.object({
  deployment: VercelDeploymentSchema.extend({
    readyState: z
      .enum(['QUEUED', 'BUILDING', 'READY', 'ERROR', 'CANCELED'])
      .optional()
      .describe('Current state of the deployment'),
  }),
  links: z
    .object({
      deployment: z.string().optional(),
      project: z.string().optional(),
    })
    .optional()
    .describe('Related resource links'),
  plan: z.string().optional().describe('Vercel plan type'),
  project: z
    .object({
      id: z.string(),
    })
    .optional()
    .describe('Project reference'),
});

/**
 * Webhook event for deployment.ready.
 * Sent when a deployment has finished building and is ready.
 */
export const DeploymentReadyWebhookSchema = BaseWebhookSchema.extend({
  type: z.literal('deployment.ready'),
  payload: DeploymentReadyPayloadSchema,
});

/**
 * Payload for deployment.check-rerequested webhook event.
 * Triggered when a user requests to re-run deployment checks.
 */
export const DeploymentCheckRerequestedPayloadSchema = z.object({
  deployment: VercelDeploymentSchema,
  check: z
    .object({
      id: z.string().describe('Check ID that was rerequested'),
      name: z.string().optional().describe('Check name'),
    })
    .optional()
    .describe('Check that was rerequested'),
  links: z
    .object({
      deployment: z.string().optional(),
      project: z.string().optional(),
    })
    .optional()
    .describe('Related resource links'),
  project: z
    .object({
      id: z.string(),
    })
    .optional()
    .describe('Project reference'),
});

/**
 * Webhook event for deployment.check-rerequested.
 * Sent when a check is manually rerequested for a deployment.
 */
export const DeploymentCheckRerequestedWebhookSchema = BaseWebhookSchema.extend({
  type: z.literal('deployment.check-rerequested'),
  payload: DeploymentCheckRerequestedPayloadSchema,
});

/**
 * Union type for all supported Vercel webhook events.
 * Use this to validate incoming webhook payloads.
 */
export const VercelWebhookEventSchema = z.discriminatedUnion('type', [
  DeploymentCreatedWebhookSchema,
  DeploymentReadyWebhookSchema,
  DeploymentCheckRerequestedWebhookSchema,
]);

// TypeScript types derived from Zod schemas
export type VercelDeployment = z.infer<typeof VercelDeploymentSchema>;
export type DeploymentCreatedPayload = z.infer<typeof DeploymentCreatedPayloadSchema>;
export type DeploymentCreatedWebhook = z.infer<typeof DeploymentCreatedWebhookSchema>;
export type DeploymentReadyPayload = z.infer<typeof DeploymentReadyPayloadSchema>;
export type DeploymentReadyWebhook = z.infer<typeof DeploymentReadyWebhookSchema>;
export type DeploymentCheckRerequestedPayload = z.infer<typeof DeploymentCheckRerequestedPayloadSchema>;
export type DeploymentCheckRerequestedWebhook = z.infer<typeof DeploymentCheckRerequestedWebhookSchema>;
export type VercelWebhookEvent = z.infer<typeof VercelWebhookEventSchema>;

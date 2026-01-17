import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { CredentialStoreRegistry } from '@inkeep/agents-core';
import {
	createAgentsManageDatabaseClient,
	createApiError,
	getTriggerById,
	JsonTransformer,
	verifySigningSecret,
	verifyTriggerAuth,
} from '@inkeep/agents-core';
import type { FullExecutionContext } from '@inkeep/agents-core';
import Ajv from 'ajv';
import { env } from '../env';
import { getLogger } from '../logger';

type AppVariables = {
	credentialStores: CredentialStoreRegistry;
	executionContext: FullExecutionContext;
	requestBody?: unknown;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('webhooks');
const ajv = new Ajv({ allErrors: true });

// Create manage database client for accessing triggers
const manageDbClient = createAgentsManageDatabaseClient({
	connectionString: env.INKEEP_AGENTS_MANAGE_DATABASE_URL,
});

/**
 * Webhook endpoint for trigger invocation
 * POST /tenants/:tenantId/projects/:projectId/agents/:agentId/triggers/:triggerId
 */
const triggerWebhookRoute = createRoute({
	method: 'post',
	path: '/tenants/:tenantId/projects/:projectId/agents/:agentId/triggers/:triggerId',
	tags: ['webhooks'],
	summary: 'Invoke agent via trigger webhook',
	description:
		'Webhook endpoint for third-party services to invoke an agent via a configured trigger',
	request: {
		params: z.object({
			tenantId: z.string().describe('Tenant ID'),
			projectId: z.string().describe('Project ID'),
			agentId: z.string().describe('Agent ID'),
			triggerId: z.string().describe('Trigger ID'),
		}),
		body: {
			content: {
				'application/json': {
					schema: z.record(z.unknown()).describe('Webhook payload'),
				},
			},
		},
	},
	responses: {
		202: {
			description: 'Webhook accepted and trigger invoked',
			content: {
				'application/json': {
					schema: z.object({
						success: z.boolean(),
						invocationId: z.string(),
					}),
				},
			},
		},
		400: {
			description: 'Invalid request payload',
			content: {
				'application/json': {
					schema: z.object({
						error: z.string(),
						validationErrors: z.array(z.string()).optional(),
					}),
				},
			},
		},
		401: {
			description: 'Missing authentication credentials',
			content: {
				'application/json': {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		403: {
			description: 'Invalid authentication credentials or signature',
			content: {
				'application/json': {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		404: {
			description: 'Trigger not found or disabled',
			content: {
				'application/json': {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		422: {
			description: 'Payload transformation failed',
			content: {
				'application/json': {
					schema: z.object({ error: z.string() }),
				},
			},
		},
	},
});

app.openapi(triggerWebhookRoute, async (c) => {
	const { tenantId, projectId, agentId, triggerId } = c.req.param();

	logger.info(
		{ tenantId, projectId, agentId, triggerId },
		'Processing trigger webhook'
	);

	try {
		// Fetch trigger configuration from manage database
		const trigger = await getTriggerById(manageDbClient)({
			scopes: { tenantId, projectId, agentId },
			triggerId,
		});

		if (!trigger) {
			throw createApiError({
				code: 'not_found',
				message: `Trigger ${triggerId} not found`,
			});
		}

		// Check if trigger is enabled
		if (!trigger.enabled) {
			throw createApiError({
				code: 'not_found',
				message: 'Trigger is disabled',
			});
		}

		// Get request body text for signature verification and parsing
		const bodyText = await c.req.text();
		const payload = bodyText ? JSON.parse(bodyText) : {};

		// Verify authentication
		if (trigger.authentication) {
			const authResult = verifyTriggerAuth(c, trigger.authentication);
			if (!authResult.valid) {
				if (authResult.statusCode === 401) {
					return c.json({ error: authResult.error || 'Unauthorized' }, 401);
				}
				return c.json({ error: authResult.error || 'Forbidden' }, 403);
			}
		}

		// Verify signing secret if configured
		if (trigger.signingSecret) {
			const signatureResult = verifySigningSecret(
				c,
				trigger.signingSecret,
				bodyText
			);
			if (!signatureResult.valid) {
				return c.json(
					{ error: signatureResult.error || 'Invalid signature' },
					403
				);
			}
		}

		// Validate payload against inputSchema
		if (trigger.inputSchema) {
			const validate = ajv.compile(trigger.inputSchema);
			const valid = validate(payload);

			if (!valid) {
				const errors = validate.errors?.map(
					(err) => `${err.instancePath} ${err.message}`
				);
				return c.json(
					{
						error: 'Payload validation failed',
						validationErrors: errors,
					},
					400
				);
			}
		}

		// Transform payload using outputTransform configuration
		let transformedPayload = payload;
		if (trigger.outputTransform) {
			try {
				transformedPayload = await JsonTransformer.transformWithConfig(
					payload,
					trigger.outputTransform
				);
				logger.debug(
					{ triggerId, tenantId, projectId },
					'Payload transformation successful'
				);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				logger.error(
					{ triggerId, tenantId, projectId, error: errorMessage },
					'Payload transformation failed'
				);
				return c.json(
					{ error: `Payload transformation failed: ${errorMessage}` },
					422
				);
			}
		}

		// TODO: US-013 - Invoke agent via /api/chat endpoint

		// For now, return 202 Accepted
		// In next iteration, we'll:
		// 1. Interpolate message template (already implemented in agents-core)
		// 2. Create invocation record in database
		// 3. Fire-and-forget agent invocation (US-013)

		const invocationId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		logger.info(
			{ tenantId, projectId, agentId, triggerId, invocationId },
			'Trigger webhook accepted'
		);

		return c.json(
			{
				success: true,
				invocationId,
			},
			202
		);
	} catch (error) {
		logger.error({ error, tenantId, projectId, agentId, triggerId }, 'Webhook processing failed');
		throw error;
	}
});

export default app;

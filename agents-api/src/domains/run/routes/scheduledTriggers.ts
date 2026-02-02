/**
 * Run API routes for scheduled triggers.
 * Provides internal execution endpoint for workflow steps.
 */
import { Hono } from 'hono';
import {
  generateId,
  getProjectScopedRef,
  interpolateTemplate,
  type Part,
  resolveRef,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../data/db';
import { getLogger } from '../../../logger';
import type { AppVariables } from '../../../types';
import { executeAgentAsync } from '../services/TriggerService';

const logger = getLogger('run-scheduled-triggers');

const app = new Hono<{ Variables: AppVariables }>();

/**
 * Internal endpoint to execute a scheduled trigger.
 * Called by the workflow step via HTTP to run execution in the main server context.
 * This avoids the module bundling issue where the workflow step has its own agentSessionManager.
 *
 * Reuses executeAgentAsync from TriggerService for consistent execution behavior.
 *
 * Full path: /run/tenants/{tenantId}/projects/{projectId}/agents/{agentId}/scheduled-triggers/internal/execute
 * This matches the runRefMiddleware regex pattern.
 */
app.post('/tenants/:tenantId/projects/:projectId/agents/:agentId/scheduled-triggers/internal/execute', async (c) => {
  // Get IDs from path params (for middleware) and body (for backwards compat)
  const tenantId = c.req.param('tenantId');
  const projectId = c.req.param('projectId');
  const agentId = c.req.param('agentId');
  
  const body = await c.req.json();
  const {
    scheduledTriggerId,
    invocationId,
    messageTemplate,
    payload,
  } = body as {
    scheduledTriggerId: string;
    invocationId: string;
    messageTemplate?: string | null;
    payload?: Record<string, unknown> | null;
    timeoutSeconds: number;
  };

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
    'Internal scheduled trigger execution started'
  );

  try {
    // Resolve the project ref
    const ref = getProjectScopedRef(tenantId, projectId, 'main');
    const resolvedRef = await resolveRef(manageDbClient)(ref);

    if (!resolvedRef) {
      return c.json({ success: false, error: `Failed to resolve ref for project ${projectId}` }, 400);
    }

    // Generate message from template or use default
    let userMessage: string;
    if (messageTemplate && payload) {
      userMessage = interpolateTemplate(messageTemplate, payload);
    } else if (messageTemplate) {
      userMessage = messageTemplate;
    } else {
      userMessage = 'Scheduled trigger execution';
    }

    // Create message parts
    const messageParts: Part[] = [{ kind: 'text', text: userMessage }];

    // Generate conversation ID
    const conversationId = generateId();

    // Reuse executeAgentAsync from TriggerService!
    // This runs in main server context with proper OTel tracing and session management.
    await executeAgentAsync({
      tenantId,
      projectId,
      agentId,
      triggerId: scheduledTriggerId, // Use scheduledTriggerId as triggerId
      invocationId,
      conversationId,
      userMessage,
      messageParts,
      resolvedRef,
    });

    logger.info(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId, conversationId },
      'Internal scheduled trigger execution completed'
    );

    return c.json({
      success: true,
      conversationId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId, error: errorMessage },
      'Internal scheduled trigger execution failed'
    );
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

export default app;

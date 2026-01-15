import { OpenAPIHono } from '@hono/zod-openapi';
import type { CredentialStoreRegistry, FullExecutionContext } from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import { flushBatchProcessor } from '../instrumentation';
import { getLogger } from '../logger';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: FullExecutionContext;
  requestBody?: any;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('feedbackHandler');

const tracer = trace.getTracer('feedback');

const feedbackSchema = z.object({
  conversationId: z.string().min(1),
  feedback: z.enum(['positive', 'negative']),
  messageId: z.string().optional(),
});

app.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = feedbackSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({ error: 'Invalid request body', details: parseResult.error.issues }, 400);
  }

  const { conversationId, feedback, messageId } = parseResult.data;
  const executionContext = c.get('executionContext');

  const tenantId = executionContext?.tenantId || 'unknown';
  const projectId = executionContext?.projectId || 'unknown';
  const agentId = executionContext?.agentId || 'unknown';

  logger.info(
    { conversationId, feedback, messageId, tenantId, projectId, agentId },
    'Submitting conversation feedback'
  );

  return tracer.startActiveSpan(
    'user.feedback',
    {
      attributes: {
        'feedback.type': feedback,
        'feedback.isPositive': feedback === 'positive',
        'conversation.id': conversationId,
        'tenant.id': tenantId,
        'project.id': projectId,
        'agent.id': agentId,
        ...(messageId && { 'feedback.messageId': messageId }),
      },
    },
    async (span) => {
      try {
        span.end();

        await new Promise((resolve) => setImmediate(resolve));
        await flushBatchProcessor();

        logger.info({ conversationId }, 'Feedback span created and flushed');
        return c.json({ success: true });
      } catch (error) {
        logger.error({ error, conversationId }, 'Error creating feedback span');
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.end();

        return c.json({ error: 'Failed to submit feedback' }, 500);
      }
    }
  );
});

export default app;

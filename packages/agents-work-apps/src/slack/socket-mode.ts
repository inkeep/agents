import { flushTraces } from '@inkeep/agents-core';
import { getLogger } from '../logger';
import { dispatchSlackEvent } from './dispatcher';
import { handleCommand } from './services';
import type { SlackCommandPayload } from './services/types';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, tracer } from './tracer';

const logger = getLogger('slack-socket-mode');
const GLOBAL_KEY = '__inkeep_slack_socket_mode_client__';

export async function startSocketMode(appToken: string): Promise<void> {
  const existing = (globalThis as Record<string, unknown>)[GLOBAL_KEY];
  if (existing) {
    logger.info({}, 'Socket Mode client already running (HMR reload detected), skipping');
    return;
  }

  const { SocketModeClient } = await import('@slack/socket-mode');
  const client = new SocketModeClient({ appToken });

  setupSocketModeListeners(client);

  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = client;
  await client.start();
  logger.info({}, 'Slack Socket Mode client started');
}

interface SocketModeEventEmitter {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

function setupSocketModeListeners(client: SocketModeEventEmitter): void {
  client.on('slack_event', async (...args: unknown[]) => {
    const { ack, body, type } = args[0] as {
      ack: () => Promise<void>;
      body: Record<string, unknown>;
      type: string;
    };

    if (type !== 'events_api') return;
    await ack();

    await tracer.startActiveSpan(SLACK_SPAN_NAMES.WEBHOOK, async (span) => {
      try {
        const eventType = (body.event as { type?: string })?.type
          ? 'event_callback'
          : (body.type as string) || '';
        span.setAttribute(SLACK_SPAN_KEYS.EVENT_TYPE, eventType);
        span.updateName(`${SLACK_SPAN_NAMES.WEBHOOK} ${eventType}`);

        const result = await dispatchSlackEvent(
          eventType,
          body,
          { registerBackgroundWork: () => {} },
          span
        );
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, result.outcome);
      } catch (error) {
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, 'error');
        logger.error({ error }, 'Error handling Socket Mode event');
      } finally {
        span.end();
        await flushTraces();
      }
    });
  });

  client.on('interactive', async (...args: unknown[]) => {
    const { ack, body } = args[0] as {
      ack: (response?: Record<string, unknown>) => Promise<void>;
      body: Record<string, unknown>;
    };

    const eventType = (body.type as string) || '';

    const result = await tracer.startActiveSpan(
      `${SLACK_SPAN_NAMES.WEBHOOK} ${eventType}`,
      async (span) => {
        try {
          span.setAttribute(SLACK_SPAN_KEYS.EVENT_TYPE, eventType);
          const r = await dispatchSlackEvent(
            eventType,
            body,
            { registerBackgroundWork: () => {} },
            span
          );
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, r.outcome);
          return r;
        } catch (error) {
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, 'error');
          logger.error({ error }, 'Error handling Socket Mode interactive event');
          return { outcome: 'error' as const };
        } finally {
          span.end();
        }
      }
    );

    await ack(result.response);
    await flushTraces();
  });

  client.on('slash_commands', async (...args: unknown[]) => {
    const { ack, body } = args[0] as {
      ack: (response?: Record<string, unknown>) => Promise<void>;
      body: Record<string, string>;
    };

    const commandPayload: SlackCommandPayload = {
      command: body.command || '',
      text: body.text || '',
      userId: body.user_id || '',
      userName: body.user_name || '',
      teamId: body.team_id || '',
      teamDomain: body.team_domain || '',
      enterpriseId: body.enterprise_id,
      channelId: body.channel_id || '',
      channelName: body.channel_name || '',
      responseUrl: body.response_url || '',
      triggerId: body.trigger_id || '',
    };

    const response = await handleCommand(commandPayload);
    await ack(
      Object.keys(response).length > 0
        ? (response as unknown as Record<string, unknown>)
        : undefined
    );
  });
}

import { PostHog } from 'posthog-node';

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  if (process.env.NODE_ENV === 'test' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    console.log(`[PostHog Server] Skipping event capture: ${event} (${distinctId})`);
    return;
  }

  try {
    const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });

    posthog.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        $lib: 'posthog-node',
        source: 'server',
      },
    });

    await posthog.shutdown();

    console.log(`[PostHog Server] ✓ Captured event: ${event}`, {
      distinctId,
      properties,
    });
  } catch (error) {
    console.error('[PostHog Server] Failed to capture event:', error);
  }
}

export async function identifyServerUser(
  distinctId: string,
  properties?: Record<string, unknown>
): Promise<void> {
  if (process.env.NODE_ENV === 'test' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    console.log(`[PostHog Server] Skipping user identify: ${distinctId}`);
    return;
  }

  try {
    const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });

    posthog.identify({
      distinctId,
      properties,
    });

    await posthog.shutdown();

    console.log(`[PostHog Server] ✓ Identified user: ${distinctId}`, {
      properties,
    });
  } catch (error) {
    console.error('[PostHog Server] Failed to identify user:', error);
  }
}

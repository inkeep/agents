import crypto from 'node:crypto';
import { getLogger } from '../../../../logger';

const logger = getLogger('slack-security');

export function verifySlackRequest(
  signingSecret: string,
  requestBody: string,
  timestamp: string,
  signature: string
): boolean {
  try {
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (Number.parseInt(timestamp, 10) < fiveMinutesAgo) {
      logger.warn({}, 'Slack request timestamp too old');
      return false;
    }

    const sigBaseString = `v0:${timestamp}:${requestBody}`;
    const mySignature = `v0=${crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex')}`;

    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  } catch (error) {
    logger.error({ error }, 'Error verifying Slack request');
    return false;
  }
}

export function parseSlackCommandBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  return Object.fromEntries(params.entries());
}

export function parseSlackEventBody(body: string, contentType: string): Record<string, unknown> {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const payload = params.get('payload');

    if (payload) {
      return JSON.parse(payload);
    }

    return Object.fromEntries(params.entries());
  }

  return JSON.parse(body);
}

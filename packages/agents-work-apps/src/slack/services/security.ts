/**
 * Slack Security Utilities
 *
 * Provides security functions for verifying Slack requests and parsing payloads.
 * All incoming Slack requests are verified using HMAC-SHA256 signatures.
 */

import crypto from 'node:crypto';
import { getLogger } from '../../logger';

const logger = getLogger('slack-security');

/**
 * Verify that a request originated from Slack using HMAC-SHA256 signature.
 *
 * @param signingSecret - The Slack signing secret from app settings
 * @param requestBody - The raw request body string
 * @param timestamp - The X-Slack-Request-Timestamp header value
 * @param signature - The X-Slack-Signature header value
 * @returns true if the signature is valid, false otherwise
 */
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

/**
 * Parse a URL-encoded Slack command body into key-value pairs.
 *
 * @param body - The URL-encoded request body from a slash command
 * @returns Parsed parameters as a string record
 */
export function parseSlackCommandBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  return Object.fromEntries(params.entries());
}

/**
 * Parse a Slack event body based on content type.
 * Handles both JSON and URL-encoded payloads (for interactive components).
 *
 * @param body - The raw request body
 * @param contentType - The Content-Type header value
 * @returns Parsed event payload
 */
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

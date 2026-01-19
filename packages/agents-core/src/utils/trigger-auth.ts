import { createHmac, timingSafeEqual } from 'crypto';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { TriggerAuthenticationSchema } from '../validation/schemas';

type TriggerAuthentication = z.infer<typeof TriggerAuthenticationSchema>;

export interface TriggerAuthResult {
  success: boolean;
  status?: number;
  message?: string;
}

/**
 * Verifies incoming webhook requests using the configured authentication method.
 * Supports api_key, basic_auth, bearer_token, and none authentication types.
 *
 * @param c - Hono context containing the request headers
 * @param authentication - Trigger authentication configuration
 * @returns TriggerAuthResult indicating success/failure with appropriate HTTP status
 */
export function verifyTriggerAuth(
  c: Context,
  authentication?: TriggerAuthentication | null
): TriggerAuthResult {
  // No authentication configured - allow all requests
  if (!authentication || authentication.type === 'none') {
    return { success: true };
  }

  switch (authentication.type) {
    case 'api_key': {
      const headerName = authentication.data.name.toLowerCase();
      const expectedValue = authentication.data.value;
      const actualValue = c.req.header(headerName);

      if (!actualValue) {
        return {
          success: false,
          status: 401,
          message: `Missing authentication header: ${authentication.data.name}`,
        };
      }

      if (actualValue !== expectedValue) {
        return {
          success: false,
          status: 403,
          message: 'Invalid API key',
        };
      }

      return { success: true };
    }

    case 'basic_auth': {
      const authHeader = c.req.header('authorization');

      if (!authHeader) {
        return {
          success: false,
          status: 401,
          message: 'Missing Authorization header',
        };
      }

      if (!authHeader.startsWith('Basic ')) {
        return {
          success: false,
          status: 401,
          message: 'Invalid Authorization header format (expected Basic)',
        };
      }

      const base64Credentials = authHeader.slice(6); // Remove 'Basic ' prefix
      let credentials: string;
      try {
        credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      } catch (error) {
        return {
          success: false,
          status: 401,
          message: 'Invalid Base64 encoding in Authorization header',
        };
      }

      const expectedCredentials = `${authentication.data.username}:${authentication.data.password}`;

      if (credentials !== expectedCredentials) {
        return {
          success: false,
          status: 403,
          message: 'Invalid username or password',
        };
      }

      return { success: true };
    }

    case 'bearer_token': {
      const authHeader = c.req.header('authorization');

      if (!authHeader) {
        return {
          success: false,
          status: 401,
          message: 'Missing Authorization header',
        };
      }

      if (!authHeader.startsWith('Bearer ')) {
        return {
          success: false,
          status: 401,
          message: 'Invalid Authorization header format (expected Bearer)',
        };
      }

      const token = authHeader.slice(7); // Remove 'Bearer ' prefix
      const expectedToken = authentication.data.token;

      if (token !== expectedToken) {
        return {
          success: false,
          status: 403,
          message: 'Invalid bearer token',
        };
      }

      return { success: true };
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = authentication;
      return {
        success: false,
        status: 500,
        message: 'Unknown authentication type',
      };
    }
  }
}

/**
 * Verifies webhook request integrity using HMAC-SHA256 signing secret.
 * Reads signature from X-Signature-256 header and uses timing-safe comparison.
 *
 * @param c - Hono context containing the request headers and body
 * @param signingSecret - HMAC-SHA256 signing secret
 * @param body - Raw request body as string
 * @returns TriggerAuthResult indicating success/failure
 */
export function verifySigningSecret(
  c: Context,
  signingSecret: string | null | undefined,
  body: string
): TriggerAuthResult {
  // No signing secret configured - skip verification
  if (!signingSecret) {
    return { success: true };
  }

  const signature = c.req.header('x-signature-256');

  if (!signature) {
    return {
      success: false,
      status: 401,
      message: 'Missing X-Signature-256 header',
    };
  }

  // Compute HMAC-SHA256 signature
  const hmac = createHmac('sha256', signingSecret).update(body).digest('hex');
  const expectedSignature = `sha256=${hmac}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    // Ensure buffers are same length before comparison
    if (signatureBuffer.length !== expectedBuffer.length) {
      return {
        success: false,
        status: 403,
        message: 'Invalid signature',
      };
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      return {
        success: false,
        status: 403,
        message: 'Invalid signature',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      status: 403,
      message: 'Invalid signature format',
    };
  }
}

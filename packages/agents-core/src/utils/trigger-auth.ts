import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Context } from 'hono';
import type { z } from 'zod';
import type {
  TriggerAuthenticationStoredSchema,
  TriggerAuthHeaderInputSchema,
  TriggerAuthHeaderStoredSchema,
} from '../validation/schemas';

const scryptAsync = promisify(scrypt);

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const VALUE_PREFIX_LENGTH = 8;

type TriggerAuthHeaderInput = z.infer<typeof TriggerAuthHeaderInputSchema>;
type TriggerAuthHeaderStored = z.infer<typeof TriggerAuthHeaderStoredSchema>;
type TriggerAuthenticationStored = z.infer<typeof TriggerAuthenticationStoredSchema>;

export interface TriggerAuthResult {
  success: boolean;
  status?: number;
  message?: string;
}

export interface HashedHeaderValue {
  valueHash: string;
  valuePrefix: string;
}

/**
 * Hash a header value using scrypt for secure storage.
 * Returns the hash and a prefix for display purposes.
 *
 * @param value - The plaintext header value to hash
 * @returns Object containing valueHash (for storage) and valuePrefix (for display)
 */
export async function hashTriggerHeaderValue(value: string): Promise<HashedHeaderValue> {
  const salt = randomBytes(SALT_LENGTH);
  const hashedBuffer = (await scryptAsync(value, salt, KEY_LENGTH)) as Buffer;
  const combined = Buffer.concat([salt, hashedBuffer]);

  return {
    valueHash: combined.toString('base64'),
    valuePrefix: value.substring(0, VALUE_PREFIX_LENGTH),
  };
}

/**
 * Validate a header value against its stored hash using timing-safe comparison.
 *
 * @param value - The plaintext header value from the incoming request
 * @param storedHash - The hash stored in the database
 * @returns True if the value matches the hash
 */
export async function validateTriggerHeaderValue(
  value: string,
  storedHash: string
): Promise<boolean> {
  try {
    const combined = Buffer.from(storedHash, 'base64');
    const salt = combined.subarray(0, SALT_LENGTH);
    const storedHashBuffer = combined.subarray(SALT_LENGTH);

    const hashedBuffer = (await scryptAsync(value, salt, KEY_LENGTH)) as Buffer;

    return timingSafeEqual(storedHashBuffer, hashedBuffer);
  } catch {
    return false;
  }
}

/**
 * Transform authentication input (plaintext values) to stored format (hashed values).
 * Used when creating or updating triggers.
 *
 * @param headers - Array of header inputs with plaintext values
 * @returns Array of headers with hashed values for storage
 */
export async function hashAuthenticationHeaders(
  headers: TriggerAuthHeaderInput[]
): Promise<TriggerAuthHeaderStored[]> {
  return Promise.all(
    headers.map(async (header) => {
      const { valueHash, valuePrefix } = await hashTriggerHeaderValue(header.value);
      return {
        name: header.name,
        valueHash,
        valuePrefix,
      };
    })
  );
}

/**
 * Verifies incoming webhook requests using the configured authentication headers.
 * Each configured header must be present and match its expected value (via hash comparison).
 *
 * @param c - Hono context containing the request headers
 * @param authentication - Trigger authentication configuration with hashed header values
 * @returns TriggerAuthResult indicating success/failure with appropriate HTTP status
 */
export async function verifyTriggerAuth(
  c: Context,
  authentication?: TriggerAuthenticationStored | null
): Promise<TriggerAuthResult> {
  // No authentication configured or no headers - allow all requests
  if (!authentication || !authentication.headers || authentication.headers.length === 0) {
    return { success: true };
  }

  // Verify each configured header
  for (const header of authentication.headers) {
    const headerName = header.name.toLowerCase();
    const actualValue = c.req.header(headerName);

    if (!actualValue) {
      return {
        success: false,
        status: 401,
        message: `Missing authentication header: ${header.name}`,
      };
    }

    const isValid = await validateTriggerHeaderValue(actualValue, header.valueHash);

    if (!isValid) {
      return {
        success: false,
        status: 403,
        message: `Invalid value for header: ${header.name}`,
      };
    }
  }

  return { success: true };
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
  } catch {
    return {
      success: false,
      status: 403,
      message: 'Invalid signature format',
    };
  }
}

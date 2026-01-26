import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Context } from 'hono';
import type { z } from 'zod';
import type {
  SignatureVerificationConfig,
  TriggerAuthenticationStoredSchema,
  TriggerAuthHeaderInputSchema,
  TriggerAuthHeaderStoredSchema,
} from '../validation/schemas';
import { searchJMESPath } from './jmespath-utils';

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
 * Error codes for signature verification failures.
 */
export type SignatureVerificationErrorCode =
  | 'MISSING_SIGNATURE'
  | 'MISSING_COMPONENT'
  | 'INVALID_SIGNATURE_FORMAT'
  | 'SIGNATURE_MISMATCH';

export interface SignatureVerificationResult {
  success: boolean;
  errorCode?: SignatureVerificationErrorCode;
  status?: number;
  message?: string;
}

/**
 * Extracts the signature from the request based on configuration.
 * Supports extraction from headers, query parameters, or body via JMESPath.
 * Optionally strips prefix and applies regex extraction.
 *
 * @param c - Hono context
 * @param config - Signature verification configuration
 * @param body - Raw request body as string
 * @returns Extracted signature string or null if not found
 */
function extractSignature(
  c: Context,
  config: SignatureVerificationConfig,
  body: string
): string | null {
  const { signature } = config;
  const caseSensitive = config.validation?.headerCaseSensitive ?? false;

  let value: string | undefined;

  // Extract based on source
  if (signature.source === 'header') {
    const headerKey = caseSensitive ? signature.key : signature.key.toLowerCase();
    value = c.req.header(headerKey);
  } else if (signature.source === 'query') {
    value = c.req.query(signature.key);
  } else if (signature.source === 'body') {
    try {
      const bodyData = JSON.parse(body);
      value = searchJMESPath<string | undefined>(bodyData, signature.key);
    } catch {
      return null;
    }
  }

  if (!value) {
    return null;
  }

  // Strip prefix if configured
  if (signature.prefix && value.startsWith(signature.prefix)) {
    value = value.slice(signature.prefix.length);
  }

  // Apply regex extraction if configured
  if (signature.regex) {
    try {
      const match = value.match(new RegExp(signature.regex));
      if (match?.[1]) {
        value = match[1];
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  return value;
}

/**
 * Extracts a single signed component from the request.
 *
 * @param c - Hono context
 * @param component - Component configuration
 * @param body - Raw request body as string
 * @param caseSensitive - Whether header names should be case-sensitive
 * @returns Extracted component value or null if required and not found
 */
function extractComponent(
  c: Context,
  component: SignatureVerificationConfig['signedComponents'][number],
  body: string,
  caseSensitive: boolean
): string | null {
  let value: string | undefined;

  if (component.source === 'literal') {
    value = component.value ?? '';
  } else if (component.source === 'header') {
    if (!component.key) {
      return component.required ? null : '';
    }
    const headerKey = caseSensitive ? component.key : component.key.toLowerCase();
    value = c.req.header(headerKey);
  } else if (component.source === 'body') {
    if (!component.key) {
      // No key means use the entire raw body
      value = body;
    } else {
      try {
        const bodyData = JSON.parse(body);
        value = searchJMESPath<string | undefined>(bodyData, component.key);
      } catch {
        return component.required ? null : '';
      }
    }
  }

  if (value === undefined || value === null) {
    return component.required ? null : '';
  }

  // Convert to string if needed
  value = String(value);

  // Apply regex extraction if configured
  if (component.regex) {
    try {
      const match = value.match(new RegExp(component.regex));
      if (match?.[1]) {
        value = match[1];
      } else {
        return component.required ? null : '';
      }
    } catch {
      return component.required ? null : '';
    }
  }

  return value;
}

/**
 * Verifies webhook signature using flexible, provider-agnostic configuration.
 * Supports GitHub, Slack, Zendesk, Stripe and other webhook signature schemes.
 *
 * SECURITY: Uses crypto.timingSafeEqual() for all signature comparisons to prevent timing attacks.
 *
 * @param c - Hono context containing request headers, query, and body
 * @param config - Signature verification configuration
 * @param signingSecret - HMAC signing secret
 * @param body - Raw request body as string
 * @returns SignatureVerificationResult with success status and error details
 *
 * @example
 * // GitHub webhook verification
 * const result = verifySignatureWithConfig(c, {
 *   algorithm: 'sha256',
 *   encoding: 'hex',
 *   signature: { source: 'header', key: 'x-hub-signature-256', prefix: 'sha256=' },
 *   signedComponents: [{ source: 'body', key: '@' }],
 *   componentJoin: { strategy: 'concatenate', separator: '' }
 * }, secret, body);
 */
export function verifySignatureWithConfig(
  c: Context,
  config: SignatureVerificationConfig,
  signingSecret: string,
  body: string
): SignatureVerificationResult {
  const caseSensitive = config.validation?.headerCaseSensitive ?? false;
  const allowEmptyBody = config.validation?.allowEmptyBody ?? true;
  const normalizeUnicode = config.validation?.normalizeUnicode ?? false;

  // Extract signature from request
  const signature = extractSignature(c, config, body);
  if (!signature) {
    return {
      success: false,
      errorCode: 'MISSING_SIGNATURE',
      status: 401,
      message: 'Missing or invalid signature',
    };
  }

  // Extract and join signed components
  const components: string[] = [];
  for (const componentConfig of config.signedComponents) {
    const componentValue = extractComponent(c, componentConfig, body, caseSensitive);
    if (componentValue === null) {
      return {
        success: false,
        errorCode: 'MISSING_COMPONENT',
        status: 400,
        message: 'Missing required signed component',
      };
    }
    components.push(componentValue);
  }

  // Join components according to strategy
  let signedData = components.join(config.componentJoin.separator);

  // Normalize Unicode if configured
  if (normalizeUnicode) {
    signedData = signedData.normalize('NFC');
  }

  // Handle empty body validation
  if (!allowEmptyBody && signedData === '') {
    return {
      success: false,
      errorCode: 'MISSING_COMPONENT',
      status: 400,
      message: 'Empty body not allowed',
    };
  }

  // Compute HMAC signature
  const hmac = createHmac(config.algorithm, signingSecret);
  hmac.update(signedData);
  const expectedSignature = hmac.digest(config.encoding);

  // Use timing-safe comparison to prevent timing attacks (CRITICAL)
  try {
    const signatureBuffer = Buffer.from(signature, config.encoding);
    const expectedBuffer = Buffer.from(expectedSignature, config.encoding);

    // Ensure buffers are same length before comparison
    if (signatureBuffer.length !== expectedBuffer.length) {
      return {
        success: false,
        errorCode: 'SIGNATURE_MISMATCH',
        status: 403,
        message: 'Invalid signature',
      };
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      return {
        success: false,
        errorCode: 'SIGNATURE_MISMATCH',
        status: 403,
        message: 'Invalid signature',
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      errorCode: 'INVALID_SIGNATURE_FORMAT',
      status: 403,
      message: 'Invalid signature format',
    };
  }
}

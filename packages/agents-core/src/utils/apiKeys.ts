import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { customAlphabet } from 'nanoid';
import { generateId } from './conversations';
import { getLogger } from './logger';

const scryptAsync = promisify(scrypt);
const logger = getLogger('api-key');

const API_KEY_LENGTH = 32; // Length of random bytes
const SALT_LENGTH = 32; // Length of salt for hashing
const KEY_LENGTH = 64; // Length of derived key from scrypt
const PUBLIC_ID_LENGTH = 12;

const PUBLIC_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-';
const generatePublicId = customAlphabet(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);

export type ApiKeyGenerationResult = {
  id: string;
  publicId: string; // Public ID for O(1) lookup
  key: string; // Full key (shown once to user)
  keyHash: string; // Hash to store in database
  keyPrefix: string; // First 8 chars for identification
};

/**
 * Generate a new API key with secure random bytes
 */
export async function generateApiKey(
  tenantId: string,
  projectId: string
): Promise<ApiKeyGenerationResult> {
  const publicId = generatePublicId();

  const secretBytes = randomBytes(API_KEY_LENGTH);
  const secret = secretBytes.toString('base64url');

  const key = `sk_${tenantId}_${projectId}_${publicId}.${secret}`;

  const keyPrefix = key.substring(0, 12);

  const keyHash = await hashApiKey(key);

  const id = generateId();

  return {
    id,
    publicId,
    key,
    keyHash,
    keyPrefix,
  };
}

export const getMetadataFromApiKey = (
  key: string
): { tenantId: string; projectId: string } | null => {
  const parts = key.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const prefixPart = parts[0]; // e.g., "sk_test_abc123def456" or "sk_abc123def456"
  const segments = prefixPart.split('_');
  if (segments.length < 3) {
    return null;
  }

  return {
    tenantId: segments[1],
    projectId: segments[2],
  };
};

/**
 * Hash an API key using scrypt
 */
export async function hashApiKey(key: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);

  const hashedBuffer = (await scryptAsync(key, salt, KEY_LENGTH)) as Buffer;

  const combined = Buffer.concat([salt, hashedBuffer]);

  return combined.toString('base64');
}

/**
 * Validate an API key against its hash
 */
export async function validateApiKey(key: string, storedHash: string): Promise<boolean> {
  try {
    const combined = Buffer.from(storedHash, 'base64');

    const salt = combined.subarray(0, SALT_LENGTH);
    const storedHashBuffer = combined.subarray(SALT_LENGTH);

    const hashedBuffer = (await scryptAsync(key, salt, KEY_LENGTH)) as Buffer;

    return timingSafeEqual(storedHashBuffer, hashedBuffer);
  } catch (error) {
    logger.error({ error }, 'Error validating API key');
    return false;
  }
}

/**
 * Check if an API key has expired
 */
export function isApiKeyExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) {
    return false; // No expiration set
  }

  const expirationDate = new Date(expiresAt);
  const now = new Date();

  return now > expirationDate;
}

/**
 * Extract the publicId from an API key
 */
export function extractPublicId(key: string): string | null {
  try {
    const parts = key.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const prefixPart = parts[0]; // e.g., "sk_test_abc123def456" or "sk_abc123def456"
    const segments = prefixPart.split('_');

    if (segments.length < 2) {
      return null;
    }

    const publicId = segments[segments.length - 1];

    if (publicId.length !== 12) {
      return null;
    }

    return publicId;
  } catch {
    return null;
  }
}

/**
 * Mask an API key for display (show only prefix and last 4 chars)
 */
export function maskApiKey(keyPrefix: string): string {
  return `${keyPrefix}...`;
}

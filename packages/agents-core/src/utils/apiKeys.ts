import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { customAlphabet, nanoid } from 'nanoid';
import { getLogger } from './logger.js';

const scryptAsync = promisify(scrypt);
const logger = getLogger('api-key');

// API key configuration
const API_KEY_LENGTH = 32; // Length of random bytes
const SALT_LENGTH = 32; // Length of salt for hashing
const KEY_LENGTH = 64; // Length of derived key from scrypt
const PUBLIC_ID_LENGTH = 12;

// Custom alphabet excluding underscores and dots
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
export async function generateApiKey(): Promise<ApiKeyGenerationResult> {
  const publicId = generatePublicId();

  // Generate secret part (random bytes)
  const secretBytes = randomBytes(API_KEY_LENGTH);
  const secret = secretBytes.toString('base64url');

  // Create key in format: sk_<env>_<publicId>.<secret>
  const key = `sk_${publicId}.${secret}`;

  // Extract prefix for identification (first 12 chars)
  const keyPrefix = key.substring(0, 12);

  // Hash the entire key for storage
  const keyHash = await hashApiKey(key);

  // Generate unique ID for database record
  const id = nanoid();

  return {
    id,
    publicId,
    key,
    keyHash,
    keyPrefix,
  };
}

/**
 * Hash an API key using scrypt
 */
export async function hashApiKey(key: string): Promise<string> {
  // Generate a random salt
  const salt = randomBytes(SALT_LENGTH);

  // Hash the key with scrypt
  const hashedBuffer = (await scryptAsync(key, salt, KEY_LENGTH)) as Buffer;

  // Combine salt and hash for storage
  const combined = Buffer.concat([salt, hashedBuffer]);

  // Return as base64 string
  return combined.toString('base64');
}

/**
 * Validate an API key against its hash
 */
export async function validateApiKey(key: string, storedHash: string): Promise<boolean> {
  try {
    // Decode the stored hash
    const combined = Buffer.from(storedHash, 'base64');

    // Extract salt and hash
    const salt = combined.subarray(0, SALT_LENGTH);
    const storedHashBuffer = combined.subarray(SALT_LENGTH);

    // Hash the provided key with the same salt
    const hashedBuffer = (await scryptAsync(key, salt, KEY_LENGTH)) as Buffer;

    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(storedHashBuffer, hashedBuffer);
  } catch (error) {
    logger.error({ error }, 'Error validating API key');
    // Return false for any errors (invalid format, etc.)
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
    // Expected format: sk_<env>_<publicId>.<secret> or sk_<publicId>.<secret>
    const parts = key.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const prefixPart = parts[0]; // e.g., "sk_test_abc123def456" or "sk_abc123def456"
    const segments = prefixPart.split('_');

    if (segments.length < 2) {
      return null;
    }

    // Get the last segment which should be the publicId
    const publicId = segments[segments.length - 1];

    // Validate publicId length (should be 12 chars)
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

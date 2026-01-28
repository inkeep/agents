import crypto from 'node:crypto';

/**
 * Validates the x-vercel-signature header from a Vercel webhook request.
 *
 * Vercel signs webhook payloads using HMAC-SHA1 with the integration secret.
 * The signature is provided in the x-vercel-signature header.
 *
 * @param rawBody - The raw request body as a string
 * @param signature - The signature from the x-vercel-signature header
 * @param secret - The Vercel integration secret used to sign payloads
 * @returns true if the signature is valid, false otherwise
 */
export function validateVercelSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expectedSignature = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

  // Ensure both signatures have the same length before comparison
  // This is required for timingSafeEqual
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

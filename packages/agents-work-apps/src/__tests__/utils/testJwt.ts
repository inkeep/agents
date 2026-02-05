/**
 * Test utilities for generating JWT tokens for GitHub OIDC token exchange testing.
 *
 * This module provides helpers to generate RS256 key pairs and create JWTs with
 * configurable claims for testing the token exchange endpoint.
 */
import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const EXPECTED_AUDIENCE = 'inkeep-agents-action';

export interface GitHubOidcTestClaims {
  repository?: string;
  repository_owner?: string;
  repository_id?: string;
  workflow?: string;
  actor?: string;
  ref?: string;
}

export interface TestKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
  kid: string;
}

let cachedKeyPair: TestKeyPair | null = null;

/**
 * Generates an RS256 key pair for signing test JWTs.
 * The key pair is cached to avoid regenerating it for each test.
 *
 * @returns The generated key pair with both keys and the public key as JWK
 *
 * @example
 * ```typescript
 * const keyPair = await generateTestKeyPair();
 * const token = await createTestOidcToken({ keyPair });
 * ```
 */
export async function generateTestKeyPair(): Promise<TestKeyPair> {
  if (cachedKeyPair) {
    return cachedKeyPair;
  }

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = `test-key-${Date.now()}`;
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  cachedKeyPair = {
    privateKey,
    publicKey,
    publicJwk,
    kid,
  };

  return cachedKeyPair;
}

/**
 * Clears the cached key pair. Call this between test suites if needed.
 */
export function clearTestKeyPairCache(): void {
  cachedKeyPair = null;
}

export interface CreateTokenOptions {
  /** The key pair to sign with. If not provided, generates a new one. */
  keyPair?: TestKeyPair;
  /** Override the issuer claim. Defaults to GitHub OIDC issuer. */
  issuer?: string;
  /** Override the audience claim. Defaults to expected audience. */
  audience?: string;
  /** Override expiration time in seconds from now. Defaults to 3600 (1 hour). */
  expiresInSeconds?: number;
  /** Set to true to create an already-expired token. */
  expired?: boolean;
  /** Custom claims to include in the token payload. */
  claims?: GitHubOidcTestClaims;
  /** Override the key ID in the JWT header. Defaults to the key pair's kid. */
  kid?: string;
  /** Use a different algorithm (for testing invalid algorithm errors). */
  algorithm?: 'RS256' | 'HS256' | 'ES256';
}

/**
 * Default test claims that match a typical GitHub Actions OIDC token.
 */
export const defaultTestClaims: GitHubOidcTestClaims = {
  repository: 'test-org/test-repo',
  repository_owner: 'test-org',
  repository_id: '123456789',
  workflow: 'CI',
  actor: 'test-user',
  ref: 'refs/heads/main',
};

/**
 * Creates a test OIDC token with configurable claims and signing options.
 *
 * @param options - Configuration options for token generation
 * @returns The signed JWT token string
 *
 * @example
 * ```typescript
 * // Valid token
 * const token = await createTestOidcToken();
 *
 * // Expired token
 * const expiredToken = await createTestOidcToken({ expired: true });
 *
 * // Wrong issuer
 * const wrongIssuer = await createTestOidcToken({ issuer: 'https://wrong.issuer.com' });
 *
 * // Wrong audience
 * const wrongAudience = await createTestOidcToken({ audience: 'wrong-audience' });
 *
 * // Custom claims
 * const customToken = await createTestOidcToken({
 *   claims: { repository: 'my-org/my-repo', actor: 'my-user' }
 * });
 * ```
 */
export async function createTestOidcToken(options: CreateTokenOptions = {}): Promise<string> {
  const {
    keyPair: providedKeyPair,
    issuer = GITHUB_OIDC_ISSUER,
    audience = EXPECTED_AUDIENCE,
    expiresInSeconds = 3600,
    expired = false,
    claims = {},
    kid: overrideKid,
  } = options;

  const keyPair = providedKeyPair ?? (await generateTestKeyPair());
  const kid = overrideKid ?? keyPair.kid;

  const now = Math.floor(Date.now() / 1000);
  const exp = expired ? now - 3600 : now + expiresInSeconds; // If expired, set expiration to 1 hour ago

  const allClaims = { ...defaultTestClaims, ...claims };

  const token = await new SignJWT({
    ...allClaims,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(exp)
    .setIssuedAt(now)
    .sign(keyPair.privateKey);

  return token;
}

/**
 * Creates a token with missing required claims for testing validation errors.
 *
 * @param options - Configuration options
 * @param missingClaims - Array of claim names to omit from the token
 * @returns The signed JWT token string with missing claims
 *
 * @example
 * ```typescript
 * // Token missing repository claim
 * const token = await createTokenWithMissingClaims(['repository']);
 *
 * // Token missing multiple claims
 * const token = await createTokenWithMissingClaims(['repository', 'actor']);
 * ```
 */
export async function createTokenWithMissingClaims(
  missingClaims: (keyof GitHubOidcTestClaims)[],
  options: Omit<CreateTokenOptions, 'claims'> = {}
): Promise<string> {
  const claims = { ...defaultTestClaims };
  for (const claim of missingClaims) {
    delete claims[claim];
  }
  return createTestOidcToken({ ...options, claims });
}

/**
 * Creates a malformed/invalid JWT string for testing parse errors.
 *
 * @param type - The type of malformed token to create
 * @returns An invalid JWT string
 *
 * @example
 * ```typescript
 * const notJwt = createMalformedToken('not-jwt');        // "not-a-jwt"
 * const badBase64 = createMalformedToken('bad-base64'); // "bad.base64.token"
 * const badJson = createMalformedToken('bad-json');     // Valid base64 but not JSON
 * ```
 */
export function createMalformedToken(
  type: 'not-jwt' | 'bad-base64' | 'bad-json' | 'empty'
): string {
  switch (type) {
    case 'not-jwt':
      return 'not-a-jwt';
    case 'bad-base64':
      return 'bad.base64.token';
    case 'bad-json':
      // Valid base64 but contains "not json" when decoded
      return `${btoa('not json')}.${btoa('also not json')}.signature`;
    case 'empty':
      return '';
    default:
      return 'invalid';
  }
}

/**
 * Gets the JWKS response that can be used to mock GitHub's JWKS endpoint.
 * This returns a JWKS containing the test public key.
 *
 * @param keyPair - The key pair to get JWKS for. If not provided, uses cached key pair.
 * @returns JWKS object that can be returned by a mock JWKS endpoint
 *
 * @example
 * ```typescript
 * const keyPair = await generateTestKeyPair();
 * const jwks = getTestJwks(keyPair);
 * // Use in mock: vi.fn().mockResolvedValue(jwks)
 * ```
 */
export function getTestJwks(keyPair?: TestKeyPair): { keys: JWK[] } {
  const kp = keyPair ?? cachedKeyPair;
  if (!kp) {
    throw new Error('No key pair available. Call generateTestKeyPair() first.');
  }
  return {
    keys: [kp.publicJwk],
  };
}

/**
 * Creates a token signed with a different key than the test key pair.
 * This is useful for testing signature verification failures.
 *
 * @param options - Configuration options (will generate a fresh key pair)
 * @returns Object containing the token and the key pair used (different from cached)
 *
 * @example
 * ```typescript
 * const { token, keyPair: differentKeyPair } = await createTokenWithDifferentKey();
 * // token is signed with differentKeyPair, not the cached test key pair
 * ```
 */
export async function createTokenWithDifferentKey(
  options: Omit<CreateTokenOptions, 'keyPair'> = {}
): Promise<{ token: string; keyPair: TestKeyPair }> {
  // Generate a fresh key pair (not cached)
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = `different-key-${Date.now()}`;
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const keyPair: TestKeyPair = {
    privateKey,
    publicKey,
    publicJwk,
    kid,
  };

  const token = await createTestOidcToken({
    ...options,
    keyPair,
  });

  return { token, keyPair };
}

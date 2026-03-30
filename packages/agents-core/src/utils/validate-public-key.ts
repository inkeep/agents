import { importSPKI } from 'jose';

const ALLOWED_ALGORITHMS = new Set(['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA']);

const KEY_TYPE_PROBE_ALGORITHMS: Record<string, string[]> = {
  RSA: ['RS256'],
  EC: ['ES256', 'ES384', 'ES512'],
  OKP: ['EdDSA'],
};

const ALGORITHM_KEY_TYPE: Record<string, string> = {
  RS256: 'RSA',
  RS384: 'RSA',
  RS512: 'RSA',
  ES256: 'EC',
  ES384: 'EC',
  ES512: 'EC',
  EdDSA: 'OKP',
};

export type ValidatePublicKeyResult = { valid: true } | { valid: false; error: string };

async function detectKeyType(pem: string): Promise<string | null> {
  for (const [keyType, algorithms] of Object.entries(KEY_TYPE_PROBE_ALGORITHMS)) {
    for (const alg of algorithms) {
      try {
        await importSPKI(pem, alg);
        return keyType;
      } catch {}
    }
  }
  return null;
}

export async function validatePublicKey(
  pem: string,
  algorithm: string
): Promise<ValidatePublicKeyResult> {
  if (!ALLOWED_ALGORITHMS.has(algorithm)) {
    return {
      valid: false,
      error: `Unsupported algorithm "${algorithm}". Allowed: ${[...ALLOWED_ALGORITHMS].join(', ')}`,
    };
  }

  if (pem.includes('PRIVATE KEY')) {
    return {
      valid: false,
      error: 'The provided key is a private key. Please provide a public key only.',
    };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importSPKI(pem, algorithm);
  } catch {
    const detectedType = await detectKeyType(pem);
    if (detectedType && detectedType !== ALGORITHM_KEY_TYPE[algorithm]) {
      return {
        valid: false,
        error: `Key type does not match declared algorithm "${algorithm}". The key is ${detectedType} but "${algorithm}" requires ${ALGORITHM_KEY_TYPE[algorithm]}.`,
      };
    }
    return {
      valid: false,
      error: 'Invalid PEM format. The key could not be parsed as a valid SPKI public key.',
    };
  }

  const expectedKeyType = ALGORITHM_KEY_TYPE[algorithm];
  const actualKeyType = cryptoKey.algorithm;

  if (expectedKeyType === 'RSA') {
    if (!('modulusLength' in actualKeyType)) {
      return {
        valid: false,
        error: `Key type does not match declared algorithm "${algorithm}". Expected an RSA key.`,
      };
    }
    const modulusLength = (actualKeyType as RsaHashedKeyAlgorithm).modulusLength;
    if (modulusLength < 2048) {
      return {
        valid: false,
        error: `RSA key must be at least 2048 bits. Got ${modulusLength} bits.`,
      };
    }
  } else if (expectedKeyType === 'EC') {
    if (!('namedCurve' in actualKeyType)) {
      return {
        valid: false,
        error: `Key type does not match declared algorithm "${algorithm}". Expected an EC key.`,
      };
    }
  } else if (expectedKeyType === 'OKP') {
    const algName = (actualKeyType as { name: string }).name;
    if (algName !== 'Ed25519' && algName !== 'EdDSA') {
      return {
        valid: false,
        error: `Key type does not match declared algorithm "${algorithm}". Expected an EdDSA (Ed25519) key.`,
      };
    }
  }

  return { valid: true };
}

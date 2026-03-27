import { derivePlaygroundKid, getAppById, updateApp } from '@inkeep/agents-core';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('playground-app');

export async function ensurePlaygroundAppKey(): Promise<void> {
  const publicKeyB64 = env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY;
  if (!publicKeyB64) {
    logger.debug(
      {},
      'INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY not set, skipping playground key registration'
    );
    return;
  }

  const appId = env.INKEEP_PLAYGROUND_APP_ID || 'app_playground';
  const app = await getAppById(runDbClient)(appId);
  if (!app) {
    logger.debug({ appId }, 'Playground app not found, skipping key registration');
    return;
  }

  if (app.config.type !== 'web_client') {
    logger.warn({ appId }, 'Playground app is not a web_client app');
    return;
  }

  const publicKeyPem = Buffer.from(publicKeyB64, 'base64').toString('utf-8');
  const kid = await derivePlaygroundKid(publicKeyPem);
  const webClient = app.config.webClient as Record<string, unknown>;
  const auth = (webClient.auth ?? {}) as Record<string, unknown>;
  const existingKeys = (auth.publicKeys ?? []) as Array<{
    kid: string;
    publicKey: string;
    algorithm: string;
    addedAt: string;
  }>;

  if (existingKeys.some((k) => k.kid === kid)) {
    logger.debug({ appId, kid }, 'Playground key already registered');
    return;
  }

  const newKey = {
    kid,
    publicKey: publicKeyPem,
    algorithm: 'RS256' as const,
    addedAt: new Date().toISOString(),
  };

  const updatedKeys = [...existingKeys, newKey];
  const updatedConfig = {
    type: 'web_client' as const,
    webClient: {
      ...(webClient as { allowedDomains: string[] }),
      auth: {
        ...auth,
        publicKeys: updatedKeys,
      },
    },
  };

  await updateApp(runDbClient)({
    id: appId,
    data: { config: updatedConfig as typeof app.config },
  });

  logger.info({ appId, kid }, 'Registered playground public key');
}

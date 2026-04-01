import { derivePlaygroundKid, getAppById, updateApp } from '@inkeep/agents-core';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('playground-app');

function derivePlaygroundDomains(): string[] {
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL;

  if (manageUiUrl) {
    try {
      const url = new URL(manageUiUrl);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return ['localhost', '127.0.0.1'];
      }
      return [url.hostname];
    } catch {
      logger.warn(
        { manageUiUrl },
        'Invalid INKEEP_AGENTS_MANAGE_UI_URL, falling back to environment defaults'
      );
    }
  }

  if (env.ENVIRONMENT === 'production') {
    logger.error(
      {},
      'INKEEP_AGENTS_MANAGE_UI_URL not set in production — cannot derive playground allowed domains'
    );
    return [];
  }

  return ['localhost', '127.0.0.1'];
}

export async function ensurePlaygroundAppConfig(): Promise<void> {
  const appId = env.INKEEP_PLAYGROUND_APP_ID || 'app_playground';
  logger.info({ appId }, 'Checking playground app configuration');

  const app = await getAppById(runDbClient)(appId);
  if (!app) {
    logger.info({ appId }, 'Playground app not found, skipping configuration');
    return;
  }

  if (app.config.type !== 'web_client') {
    logger.warn({ appId, type: app.config.type }, 'Playground app is not a web_client app');
    return;
  }

  const webClient = { ...app.config.webClient } as Record<string, unknown>;
  let configChanged = false;

  // --- Domain verification (additive, but replaces wildcard) ---
  // Domains are merged so that domain changes don't break pre-existing usages.
  // However, the wildcard ("*") was the insecure seed default — once we can derive
  // concrete domains, the wildcard is stripped to enforce actual domain verification.
  const derivedDomains = derivePlaygroundDomains();
  const currentDomains = (webClient.allowedDomains ?? []) as string[];
  const hasWildcard = currentDomains.includes('*');
  const specificDomains = currentDomains.filter((d) => d !== '*');
  const newDomains = derivedDomains.filter((d) => !specificDomains.includes(d));

  if (hasWildcard && derivedDomains.length > 0) {
    const mergedDomains = [...specificDomains, ...newDomains];
    logger.info(
      { appId, previousDomains: currentDomains, removedWildcard: true, mergedDomains },
      'Replacing wildcard with explicit domains on playground app'
    );
    webClient.allowedDomains = mergedDomains;
    configChanged = true;
  } else if (newDomains.length > 0) {
    const mergedDomains = [...currentDomains, ...newDomains];
    logger.info(
      { appId, currentDomains, addedDomains: newDomains, mergedDomains },
      'Adding new domains to playground app allowed domains'
    );
    webClient.allowedDomains = mergedDomains;
    configChanged = true;
  } else if (derivedDomains.length === 0) {
    logger.warn(
      { appId, currentDomains },
      'No playground domains could be derived — allowedDomains not updated'
    );
  } else {
    logger.info({ appId, domains: currentDomains }, 'Playground app domains are up to date');
  }

  // --- Public key registration ---
  const publicKeyB64 = env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY;
  if (publicKeyB64) {
    const publicKeyPem = Buffer.from(publicKeyB64, 'base64').toString('utf-8');
    const kid = await derivePlaygroundKid(publicKeyPem);
    const existingKeys = (webClient.publicKeys ?? []) as Array<{
      kid: string;
      publicKey: string;
      algorithm: string;
      addedAt: string;
    }>;

    if (!existingKeys.some((k) => k.kid === kid)) {
      const newKey = {
        kid,
        publicKey: publicKeyPem,
        algorithm: 'RS256' as const,
        addedAt: new Date().toISOString(),
      };

      const updatedKeys = [...existingKeys, newKey];
      webClient.publicKeys = updatedKeys;
      configChanged = true;

      logger.info({ appId, kid }, 'Registering playground public key');
    } else {
      logger.info({ appId, kid }, 'Playground key already registered');
    }
  }

  // --- Persist changes ---
  if (configChanged) {
    const updatedConfig = {
      type: 'web_client' as const,
      webClient: webClient as { allowedDomains: string[] },
    };

    await updateApp(runDbClient)({
      id: appId,
      data: { config: updatedConfig as typeof app.config },
    });

    logger.info(
      { appId, allowedDomains: updatedConfig.webClient.allowedDomains },
      'Playground app configuration updated'
    );
  }
}

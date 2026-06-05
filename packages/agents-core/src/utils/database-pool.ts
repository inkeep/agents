import { getLogger } from './logger';

const logger = getLogger('database-pool');

type AttachDatabasePoolFn = (dbPool: unknown) => void;

let _importPromise: Promise<AttachDatabasePoolFn | undefined> | undefined;

async function getAttachDatabasePool(): Promise<AttachDatabasePoolFn | undefined> {
  if (_importPromise) return _importPromise;
  _importPromise = (async () => {
    if (!process.env.VERCEL) return undefined;
    try {
      const mod = await import('@vercel/functions');
      return mod.attachDatabasePool;
    } catch (e) {
      logger.warn(
        { error: e },
        'Failed to import @vercel/functions, database pool attachment unavailable'
      );
      return undefined;
    }
  })();
  return _importPromise;
}

export async function tryAttachDatabasePool(dbPool: unknown): Promise<void> {
  const attachDatabasePool = await getAttachDatabasePool();
  if (!attachDatabasePool) return;

  try {
    attachDatabasePool(dbPool);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to attach database pool to Vercel Fluid Compute');
  }
}

/**
 * Reset internal cache. Exposed only for testing.
 */
export function _resetAttachDatabasePoolCache(): void {
  _importPromise = undefined;
}

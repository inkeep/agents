import { getLogger } from '../utils/logger';

const logger = getLogger('auth');

type SessionDeletionRecord = { userId?: string; id?: string } & Record<string, unknown>;
type SessionDeletionContext = { path?: string } | null | undefined;

export async function logSessionDeletion(
  session: SessionDeletionRecord,
  context: SessionDeletionContext
): Promise<void> {
  try {
    const userId = session?.userId;
    const sessionId = session?.id;
    const action = context?.path;
    const payload = action ? { userId, sessionId, action } : { userId, sessionId };
    logger.info(payload, 'Session deleted');
  } catch (err) {
    try {
      logger.warn({ err }, 'Failed to log session deletion');
    } catch {
      // Logger itself unavailable — swallow.
    }
  }
}

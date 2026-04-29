import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger, module: loggerModule, clearAll } = createMockLoggerModule();

vi.mock('../../utils/logger', () => loggerModule);

const { logSessionDeletion } = await import('../session-hooks');

describe('logSessionDeletion', () => {
  beforeEach(() => {
    clearAll();
  });

  it('logs userId and sessionId at info level when no context path is provided', async () => {
    await logSessionDeletion(
      { id: 'sess_1', userId: 'user_1', token: 'tok_1', expiresAt: new Date() },
      null
    );

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      { userId: 'user_1', sessionId: 'sess_1' },
      'Session deleted'
    );
  });

  it('includes the originating API path as the action field when present', async () => {
    await logSessionDeletion(
      { id: 'sess_2', userId: 'user_2' },
      { path: '/api/auth/revoke-session' }
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      { userId: 'user_2', sessionId: 'sess_2', action: '/api/auth/revoke-session' },
      'Session deleted'
    );
  });

  it('logs undefined fields without throwing when session metadata is missing', async () => {
    await expect(logSessionDeletion({} as never, undefined)).resolves.toBeUndefined();

    expect(mockLogger.info).toHaveBeenCalledWith(
      { userId: undefined, sessionId: undefined },
      'Session deleted'
    );
  });

  it('falls back to logger.warn when logger.info throws and never re-raises', async () => {
    mockLogger.info.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    await expect(
      logSessionDeletion({ id: 'sess_3', userId: 'user_3' }, null)
    ).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const warnArgs = mockLogger.warn.mock.calls[0];
    expect(warnArgs?.[1]).toBe('Failed to log session deletion');
  });
});

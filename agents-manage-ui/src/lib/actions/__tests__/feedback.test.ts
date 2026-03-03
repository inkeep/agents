import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../types/errors';
import { createFeedbackAction, deleteFeedbackAction } from '../feedback';

vi.mock('../../api/feedback', () => ({
  createFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
}));

describe('createFeedbackAction', () => {
  it('returns success with created feedback', async () => {
    const { createFeedback } = await import('../../api/feedback');
    const mockCreateFeedback = vi.mocked(createFeedback);

    mockCreateFeedback.mockResolvedValue({
      id: 'fb_1',
      conversationId: 'c_1',
      messageId: 'm_1',
      type: 'negative',
      details: 'Needs improvement',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await createFeedbackAction('t_1', 'p_1', {
      id: 'fb_1',
      conversationId: 'c_1',
      messageId: 'm_1',
      type: 'negative',
      details: 'Needs improvement',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('fb_1');
    }
  });

  it('maps ApiError to action failure', async () => {
    const { createFeedback } = await import('../../api/feedback');
    const mockCreateFeedback = vi.mocked(createFeedback);

    mockCreateFeedback.mockRejectedValue(
      new ApiError({ code: 'forbidden', message: 'Forbidden' }, 403)
    );

    const result = await createFeedbackAction('t_1', 'p_1', {
      id: 'fb_2',
      conversationId: 'c_1',
      type: 'negative',
      details: 'Needs improvement',
    });

    expect(result).toEqual({
      success: false,
      error: 'Forbidden',
      code: 'forbidden',
    });
  });
});

describe('deleteFeedbackAction', () => {
  it('returns success when delete succeeds', async () => {
    const { deleteFeedback } = await import('../../api/feedback');
    const mockDeleteFeedback = vi.mocked(deleteFeedback);
    mockDeleteFeedback.mockResolvedValue(undefined);

    const result = await deleteFeedbackAction('t_1', 'p_1', 'fb_1');
    expect(result).toEqual({ success: true });
  });

  it('maps ApiError to action failure', async () => {
    const { deleteFeedback } = await import('../../api/feedback');
    const mockDeleteFeedback = vi.mocked(deleteFeedback);
    mockDeleteFeedback.mockRejectedValue(
      new ApiError({ code: 'forbidden', message: 'Forbidden' }, 403)
    );

    const result = await deleteFeedbackAction('t_1', 'p_1', 'fb_1');
    expect(result).toEqual({
      success: false,
      error: 'Forbidden',
      code: 'forbidden',
    });
  });
});


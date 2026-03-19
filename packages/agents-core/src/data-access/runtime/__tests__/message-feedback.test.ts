import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteMessageFeedback,
  getConversationFeedback,
  getMessageFeedback,
  upsertMessageFeedback,
} from '../message-feedback';

const scopes = { tenantId: 'tenant-1', projectId: 'project-1' };

describe('upsertMessageFeedback', () => {
  const mockInsert = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflictDoUpdate = vi.fn();
  const mockReturning = vi.fn();

  const mockDb = { insert: mockInsert };

  const feedbackResult = {
    id: 'fb-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    type: 'positive',
    reasons: null,
    userId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([feedbackResult]);
  });

  it('creates positive feedback for a message', async () => {
    const result = await upsertMessageFeedback(mockDb as never)({
      scopes,
      data: {
        id: 'fb-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        type: 'positive',
      },
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fb-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        type: 'positive',
      })
    );
    expect(result).toEqual(feedbackResult);
  });

  it('upserts on conflict with updated type and reasons', async () => {
    await upsertMessageFeedback(mockDb as never)({
      scopes,
      data: {
        id: 'fb-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        type: 'negative',
        reasons: [{ label: 'Inaccurate', details: 'Wrong answer' }],
      },
    });

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          type: 'negative',
          reasons: [{ label: 'Inaccurate', details: 'Wrong answer' }],
        }),
      })
    );
  });

  it('stores null reasons when not provided', async () => {
    await upsertMessageFeedback(mockDb as never)({
      scopes,
      data: {
        id: 'fb-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        type: 'positive',
      },
    });

    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ reasons: null }));
  });
});

describe('getMessageFeedback', () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();

  const mockDb = { select: mockSelect };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  it('returns null when no feedback exists', async () => {
    const result = await getMessageFeedback(mockDb as never)({
      scopes,
      messageId: 'msg-1',
    });

    expect(result).toBeNull();
  });

  it('returns feedback when it exists', async () => {
    const feedback = { id: 'fb-1', type: 'positive', messageId: 'msg-1' };
    mockLimit.mockResolvedValue([feedback]);

    const result = await getMessageFeedback(mockDb as never)({
      scopes,
      messageId: 'msg-1',
    });

    expect(result).toEqual(feedback);
  });
});

describe('getConversationFeedback', () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();

  const mockDb = { select: mockSelect };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it('returns empty array when no feedback exists', async () => {
    const result = await getConversationFeedback(mockDb as never)({
      scopes,
      conversationId: 'conv-1',
    });

    expect(result).toEqual([]);
  });

  it('returns all feedback for a conversation', async () => {
    const feedbacks = [
      { id: 'fb-1', messageId: 'msg-1', type: 'positive' },
      { id: 'fb-2', messageId: 'msg-2', type: 'negative' },
    ];
    mockWhere.mockResolvedValue(feedbacks);

    const result = await getConversationFeedback(mockDb as never)({
      scopes,
      conversationId: 'conv-1',
    });

    expect(result).toEqual(feedbacks);
    expect(result).toHaveLength(2);
  });
});

describe('deleteMessageFeedback', () => {
  const mockDelete = vi.fn();
  const mockWhere = vi.fn();
  const mockReturning = vi.fn();

  const mockDb = { delete: mockDelete };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
  });

  it('returns undefined when no feedback to delete', async () => {
    const result = await deleteMessageFeedback(mockDb as never)({
      scopes,
      messageId: 'msg-1',
    });

    expect(result).toBeUndefined();
  });

  it('returns deleted feedback', async () => {
    const feedback = { id: 'fb-1', messageId: 'msg-1', type: 'positive' };
    mockReturning.mockResolvedValue([feedback]);

    const result = await deleteMessageFeedback(mockDb as never)({
      scopes,
      messageId: 'msg-1',
    });

    expect(result).toEqual(feedback);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildMediaStorageKeyPrefix,
  buildStorageKey,
  parseMediaStorageKey,
} from '../blob-storage/storage-keys';

describe('storage-keys', () => {
  it('builds versioned media storage key', () => {
    const key = buildStorageKey({
      category: 'media',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      contentHash: 'abc123',
      ext: 'png',
    });

    expect(key).toBe(
      'v1/t_tenant-1/media/p_project-1/conv/c_conversation-1/m_message-1/sha256-abc123.png'
    );
  });

  it('parses valid media storage key', () => {
    const parsed = parseMediaStorageKey(
      'v1/t_tenant-1/media/p_project-1/conv/c_conversation-1/m_message-1/sha256-abc123.png'
    );

    expect(parsed).toEqual({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      tail: 'm_message-1/sha256-abc123.png',
    });
  });

  it('returns null for invalid key segments', () => {
    expect(
      parseMediaStorageKey(
        'v2/t_tenant-1/media/p_project-1/conv/c_conversation-1/m_message-1/sha256-abc123.png'
      )
    ).toBeNull();
    expect(
      parseMediaStorageKey('v1/tenant-1/media/p_project-1/conv/c_conversation-1/x')
    ).toBeNull();
    expect(
      parseMediaStorageKey('v1/t_tenant-1/files/p_project-1/conv/c_conversation-1/x')
    ).toBeNull();
    expect(
      parseMediaStorageKey('v1/t_tenant-1/media/p_project-1/conversation/c_conversation-1/x')
    ).toBeNull();
    expect(
      parseMediaStorageKey('v1/t_tenant-1/media/project-1/conv/c_conversation-1/x')
    ).toBeNull();
    expect(
      parseMediaStorageKey('v1/t_tenant-1/media/p_project-1/conv/conversation-1/x')
    ).toBeNull();
  });

  it('builds media storage key prefix', () => {
    expect(
      buildMediaStorageKeyPrefix({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        conversationId: 'conversation-1',
      })
    ).toBe('v1/t_tenant-1/media/p_project-1/conv/c_conversation-1');
  });
});

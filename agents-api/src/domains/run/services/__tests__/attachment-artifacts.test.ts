import type { FilePart } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAttachmentArtifacts } from '../blob-storage/attachment-artifacts';

const addLedgerArtifactsMock = vi.fn();

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    addLedgerArtifacts: vi.fn(() => addLedgerArtifactsMock),
  };
});

describe('createAttachmentArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses messageId plus content hash for attachment artifact ids', async () => {
    const parts: FilePart[] = [
      {
        kind: 'file',
        file: {
          uri: 'blob://v1/t_tenant/media/p_project/conv/c_conv/m_msg/sha256-deadbeef.png',
          mimeType: 'image/png',
        },
      },
    ];

    const refs = await createAttachmentArtifacts(parts, {
      tenantId: 'tenant',
      projectId: 'project',
      conversationId: 'conversation',
      messageId: 'message',
      taskId: 'task_1',
      toolCallId: 'tool_1',
      source: 'user-message',
    });

    expect(refs).toEqual([{ artifactId: 'attachment_message_deadbeef', toolCallId: 'tool_1' }]);
    expect(addLedgerArtifactsMock).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant', projectId: 'project' },
      contextId: 'conversation',
      taskId: 'task_1',
      toolCallId: 'tool_1',
      artifacts: [
        expect.objectContaining({
          artifactId: 'attachment_message_deadbeef',
          type: 'binary_attachment',
        }),
      ],
    });
  });

  it.each([
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
  ])('skips text document mimetype %s', async (mimeType) => {
    const parts: FilePart[] = [
      {
        kind: 'file',
        file: {
          uri: 'blob://v1/t_tenant/media/p_project/conv/c_conv/m_msg/sha256-aabbccdd.txt',
          mimeType,
        },
      },
    ];

    const refs = await createAttachmentArtifacts(parts, {
      tenantId: 'tenant',
      projectId: 'project',
      conversationId: 'conversation',
      messageId: 'message',
      taskId: 'task_1',
      toolCallId: 'tool_1',
      source: 'user-message',
    });

    expect(refs).toEqual([]);
    expect(addLedgerArtifactsMock).not.toHaveBeenCalled();
  });

  it('creates artifacts for PDF attachments', async () => {
    const parts: FilePart[] = [
      {
        kind: 'file',
        file: {
          uri: 'blob://v1/t_tenant/media/p_project/conv/c_conv/m_msg/sha256-cafebabe.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];

    const refs = await createAttachmentArtifacts(parts, {
      tenantId: 'tenant',
      projectId: 'project',
      conversationId: 'conversation',
      messageId: 'message',
      taskId: 'task_1',
      toolCallId: 'tool_1',
      source: 'user-message',
    });

    expect(refs).toEqual([{ artifactId: 'attachment_message_cafebabe', toolCallId: 'tool_1' }]);
    expect(addLedgerArtifactsMock).toHaveBeenCalledOnce();
  });
});

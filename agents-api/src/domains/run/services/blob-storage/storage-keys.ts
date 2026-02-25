const STORAGE_KEY_VERSION = 'v1';

export type ConversationMediaKeyInput = {
  category: 'media';
  tenantId: string;
  projectId: string;
  conversationId: string;
  messageId: string;
  contentHash: string;
  ext: string;
};

export type StorageKeyInput = ConversationMediaKeyInput;

export function buildStorageKey(input: StorageKeyInput): string {
  switch (input.category) {
    case 'media':
      return [
        STORAGE_KEY_VERSION,
        `t_${input.tenantId}`,
        input.category,
        `p_${input.projectId}`,
        'conv',
        `c_${input.conversationId}`,
        `m_${input.messageId}`,
        `sha256-${input.contentHash}.${input.ext}`,
      ].join('/');
  }
}

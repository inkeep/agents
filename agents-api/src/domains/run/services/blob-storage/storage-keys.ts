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

export interface ParsedMediaStorageKey {
  tenantId: string;
  projectId: string;
  conversationId: string;
  tail: string;
}

export function parseMediaStorageKey(key: string): ParsedMediaStorageKey | null {
  const parts = key.split('/');
  if (parts.length < 7) return null;

  const [version, tenantSlug, category, projectSlug, conv, conversationSlug, ...tailParts] = parts;

  if (
    version !== STORAGE_KEY_VERSION ||
    category !== 'media' ||
    conv !== 'conv' ||
    !tenantSlug.startsWith('t_') ||
    !projectSlug.startsWith('p_') ||
    !conversationSlug.startsWith('c_')
  ) {
    return null;
  }

  return {
    tenantId: tenantSlug.slice(2),
    projectId: projectSlug.slice(2),
    conversationId: conversationSlug.slice(2),
    tail: tailParts.join('/'),
  };
}

export function buildMediaStorageKeyPrefix(input: {
  tenantId: string;
  projectId: string;
  conversationId: string;
}): string {
  return [
    STORAGE_KEY_VERSION,
    `t_${input.tenantId}`,
    'media',
    `p_${input.projectId}`,
    'conv',
    `c_${input.conversationId}`,
  ].join('/');
}

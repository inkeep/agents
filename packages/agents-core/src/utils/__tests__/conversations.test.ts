import { describe, expect, it } from 'vitest';
import type { BaseExecutionContext } from '../../types/utility';
import {
  buildConversationMetadata,
  buildConversationUserProperties,
  getConversationProperties,
  getConversationUserProperties,
  getMessageUserProperties,
} from '../conversations';

const baseContext = (overrides: Partial<BaseExecutionContext> = {}): BaseExecutionContext => ({
  apiKey: 'sk_test',
  tenantId: 't1',
  projectId: 'p1',
  agentId: 'a1',
  apiKeyId: 'k1',
  baseUrl: 'http://localhost',
  ...overrides,
});

describe('getConversationUserProperties', () => {
  it('returns userProperties when present', () => {
    expect(
      getConversationUserProperties({ userProperties: { userId: 'u1', role: 'admin' } })
    ).toEqual({ userId: 'u1', role: 'admin' });
  });

  it('returns null when userProperties is null', () => {
    expect(getConversationUserProperties({ userProperties: null })).toBeNull();
  });

  it('returns null when userProperties is undefined', () => {
    expect(getConversationUserProperties({ userProperties: undefined })).toBeNull();
  });

  it('does NOT fall back to metadata.userContext (D36 refinement)', () => {
    const conversation = {
      userProperties: null as Record<string, unknown> | null,
      metadata: { userContext: { userId: 'should-be-ignored' } },
    };
    expect(getConversationUserProperties(conversation)).toBeNull();
  });
});

describe('getConversationProperties', () => {
  it('returns properties when present', () => {
    expect(getConversationProperties({ properties: { url: '/docs', referrer: 'google' } })).toEqual(
      { url: '/docs', referrer: 'google' }
    );
  });

  it('returns null when properties is null', () => {
    expect(getConversationProperties({ properties: null })).toBeNull();
  });

  it('returns null when properties is undefined', () => {
    expect(getConversationProperties({ properties: undefined })).toBeNull();
  });
});

describe('getMessageUserProperties', () => {
  it('returns message-level userProperties when set, ignoring conversation', () => {
    expect(
      getMessageUserProperties(
        { userProperties: { userId: 'msg-user' } },
        { userProperties: { userId: 'conv-user' } }
      )
    ).toEqual({ userId: 'msg-user' });
  });

  it('falls back to conversation-level when message-level is null', () => {
    expect(
      getMessageUserProperties(
        { userProperties: null },
        { userProperties: { userId: 'conv-user' } }
      )
    ).toEqual({ userId: 'conv-user' });
  });

  it('falls back to conversation-level when message-level is undefined', () => {
    expect(
      getMessageUserProperties(
        { userProperties: undefined },
        { userProperties: { userId: 'conv-user' } }
      )
    ).toEqual({ userId: 'conv-user' });
  });

  it('returns null when neither message nor conversation has userProperties', () => {
    expect(getMessageUserProperties({ userProperties: null }, { userProperties: null })).toBeNull();
  });

  it('returns null when message is empty and conversation is omitted', () => {
    expect(getMessageUserProperties({ userProperties: null })).toBeNull();
  });
});

describe('buildConversationUserProperties', () => {
  it('returns the supplied userProperties unchanged', () => {
    const userProperties = { userId: 'u1', role: 'support' };
    expect(buildConversationUserProperties(baseContext(), userProperties)).toEqual(userProperties);
  });

  it('returns undefined when userProperties is omitted', () => {
    expect(buildConversationUserProperties(baseContext())).toBeUndefined();
  });
});

describe('buildConversationMetadata', () => {
  it('does NOT write userProperties argument into metadata.userContext (D36 refinement)', () => {
    const result = buildConversationMetadata(baseContext(), { userId: 'u1', role: 'admin' });
    expect(result?.userContext).toBeUndefined();
  });

  it('returns undefined when no derivable fields exist on execution context', () => {
    expect(buildConversationMetadata(baseContext())).toBeUndefined();
  });

  it('populates verifiedClaims from executionContext.metadata.verifiedClaims', () => {
    const ctx = baseContext({ metadata: { verifiedClaims: { sub: 'oauth-subject' } } });
    expect(buildConversationMetadata(ctx)).toMatchObject({
      verifiedClaims: { sub: 'oauth-subject' },
    });
  });

  it('populates externalUserId only when authenticated web-client and endUserId present', () => {
    const authedCtx = baseContext({
      metadata: {
        authMethod: 'app_credential_web_client_authenticated',
        endUserId: 'webuser-123',
      },
    });
    expect(buildConversationMetadata(authedCtx)).toMatchObject({
      externalUserId: 'webuser-123',
    });

    const apiCtx = baseContext({
      metadata: { authMethod: 'app_credential_api', endUserId: 'apiuser-123' },
    });
    expect(buildConversationMetadata(apiCtx)?.externalUserId).toBeUndefined();
  });

  it('populates initiatedBy from executionContext.metadata.initiatedBy', () => {
    const ctx = baseContext({
      metadata: { initiatedBy: { type: 'user', id: 'user-42' } },
    });
    expect(buildConversationMetadata(ctx)).toMatchObject({
      initiatedBy: { type: 'user', id: 'user-42' },
    });
  });

  it('returns undefined when only userProperties was supplied (no longer triggers metadata)', () => {
    expect(buildConversationMetadata(baseContext(), { userId: 'u1' })).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { SlackLinkIntent } from '../../utils/slack-link-token';
import {
  SlackLinkIntentSchema,
  SlackLinkTokenPayloadSchema,
  signSlackLinkToken,
  verifySlackLinkToken,
} from '../../utils/slack-link-token';

describe('slack-link-token', () => {
  const validParams = {
    tenantId: 'tenant_456',
    slackTeamId: 'T12345678',
    slackUserId: 'U87654321',
  };

  const validParamsWithEnterprise = {
    ...validParams,
    slackEnterpriseId: 'E11111111',
    slackUsername: 'testuser',
  };

  describe('signSlackLinkToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await signSlackLinkToken(validParams);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include enterprise ID and username when provided', async () => {
      const token = await signSlackLinkToken(validParamsWithEnterprise);
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.slack.enterpriseId).toBe('E11111111');
      expect(result.payload?.slack.username).toBe('testuser');
    });

    it('should not include enterprise ID when not provided', async () => {
      const token = await signSlackLinkToken(validParams);
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.slack.enterpriseId).toBeUndefined();
      expect(result.payload?.slack.username).toBeUndefined();
    });

    it('should create correct subject from teamId and userId', async () => {
      const token = await signSlackLinkToken(validParams);
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe('slack:T12345678:U87654321');
    });
  });

  describe('verifySlackLinkToken', () => {
    it('should verify a valid token', async () => {
      const token = await signSlackLinkToken(validParams);
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.sub).toBe('slack:T12345678:U87654321');
      expect(result.payload?.tenantId).toBe('tenant_456');
      expect(result.payload?.slack.teamId).toBe('T12345678');
      expect(result.payload?.slack.userId).toBe('U87654321');
      expect(result.payload?.tokenUse).toBe('slackLinkCode');
      expect(result.payload?.iss).toBe('inkeep-auth');
      expect(result.payload?.aud).toBe('slack-link');
    });

    it('should reject an invalid token', async () => {
      const result = await verifySlackLinkToken('invalid.token.here');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a token with wrong issuer', async () => {
      const result = await verifySlackLinkToken(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ3cm9uZy1pc3N1ZXIiLCJhdWQiOiJzbGFjay1saW5rIiwic3ViIjoic2xhY2s6VDEyMzQ1Njc4OlU4NzY1NDMyMSIsInRva2VuVXNlIjoic2xhY2tMaW5rQ29kZSJ9.invalid'
      );

      expect(result.valid).toBe(false);
    });

    it('should validate the schema after signature verification', async () => {
      const token = await signSlackLinkToken(validParams);
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);

      const schemaResult = SlackLinkTokenPayloadSchema.safeParse(result.payload);
      expect(schemaResult.success).toBe(true);
    });
  });

  describe('SlackLinkTokenPayloadSchema', () => {
    it('should validate a correct payload', () => {
      const payload = {
        iss: 'inkeep-auth',
        aud: 'slack-link',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackLinkCode',
        tenantId: 'tenant_456',
        slack: {
          teamId: 'T12345678',
          userId: 'U87654321',
        },
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject payload with wrong issuer', () => {
      const payload = {
        iss: 'wrong-issuer',
        aud: 'slack-link',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackLinkCode',
        tenantId: 'tenant_456',
        slack: {
          teamId: 'T12345678',
          userId: 'U87654321',
        },
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with wrong audience', () => {
      const payload = {
        iss: 'inkeep-auth',
        aud: 'inkeep-api',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackLinkCode',
        tenantId: 'tenant_456',
        slack: {
          teamId: 'T12345678',
          userId: 'U87654321',
        },
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload with wrong tokenUse', () => {
      const payload = {
        iss: 'inkeep-auth',
        aud: 'slack-link',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackUser',
        tenantId: 'tenant_456',
        slack: {
          teamId: 'T12345678',
          userId: 'U87654321',
        },
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject payload missing slack object', () => {
      const payload = {
        iss: 'inkeep-auth',
        aud: 'slack-link',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackLinkCode',
        tenantId: 'tenant_456',
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should accept payload with optional fields', () => {
      const payload = {
        iss: 'inkeep-auth',
        aud: 'slack-link',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackLinkCode',
        tenantId: 'tenant_456',
        slack: {
          teamId: 'T12345678',
          userId: 'U87654321',
          enterpriseId: 'E11111111',
          username: 'testuser',
        },
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept payload with intent', () => {
      const payload = {
        iss: 'inkeep-auth',
        aud: 'slack-link',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackLinkCode',
        tenantId: 'tenant_456',
        slack: {
          teamId: 'T12345678',
          userId: 'U87654321',
        },
        intent: {
          entryPoint: 'mention',
          question: 'What is the API rate limit?',
          channelId: 'C12345678',
          threadTs: '1234567890.123456',
          messageTs: '1234567890.123457',
          agentId: 'agent_123',
          projectId: 'project_456',
        },
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should accept payload without intent', () => {
      const payload = {
        iss: 'inkeep-auth',
        aud: 'slack-link',
        sub: 'slack:T12345678:U87654321',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        tokenUse: 'slackLinkCode',
        tenantId: 'tenant_456',
        slack: {
          teamId: 'T12345678',
          userId: 'U87654321',
        },
      };

      const result = SlackLinkTokenPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('SlackLinkIntentSchema', () => {
    it('should validate a mention intent', () => {
      const intent = {
        entryPoint: 'mention',
        question: 'What is the API rate limit?',
        channelId: 'C12345678',
        threadTs: '1234567890.123456',
        messageTs: '1234567890.123457',
        agentId: 'agent_123',
        projectId: 'project_456',
      };

      const result = SlackLinkIntentSchema.safeParse(intent);
      expect(result.success).toBe(true);
    });

    it('should validate a question_command intent', () => {
      const intent = {
        entryPoint: 'question_command',
        question: 'What is the API rate limit?',
        channelId: 'C12345678',
        responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
      };

      const result = SlackLinkIntentSchema.safeParse(intent);
      expect(result.success).toBe(true);
    });

    it('should validate a run_command intent', () => {
      const intent = {
        entryPoint: 'run_command',
        question: 'What is the API rate limit?',
        channelId: 'C12345678',
        responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
        agentIdentifier: 'my-agent',
      };

      const result = SlackLinkIntentSchema.safeParse(intent);
      expect(result.success).toBe(true);
    });

    it('should reject question longer than 2000 characters', () => {
      const intent = {
        entryPoint: 'mention',
        question: 'x'.repeat(2001),
        channelId: 'C12345678',
      };

      const result = SlackLinkIntentSchema.safeParse(intent);
      expect(result.success).toBe(false);
    });

    it('should reject empty question', () => {
      const intent = {
        entryPoint: 'mention',
        question: '',
        channelId: 'C12345678',
      };

      const result = SlackLinkIntentSchema.safeParse(intent);
      expect(result.success).toBe(false);
    });

    it('should reject invalid entry point', () => {
      const intent = {
        entryPoint: 'invalid',
        question: 'test',
        channelId: 'C12345678',
      };

      const result = SlackLinkIntentSchema.safeParse(intent);
      expect(result.success).toBe(false);
    });

    it('should reject missing channelId', () => {
      const intent = {
        entryPoint: 'mention',
        question: 'test',
      };

      const result = SlackLinkIntentSchema.safeParse(intent);
      expect(result.success).toBe(false);
    });
  });

  describe('sign and verify with intent', () => {
    const mentionIntent: SlackLinkIntent = {
      entryPoint: 'mention',
      question: 'What is the API rate limit?',
      channelId: 'C12345678',
      threadTs: '1234567890.123456',
      messageTs: '1234567890.123457',
      agentId: 'agent_123',
      projectId: 'project_456',
    };

    it('should round-trip a token with intent', async () => {
      const token = await signSlackLinkToken({
        ...validParams,
        intent: mentionIntent,
      });
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.intent).toEqual(mentionIntent);
    });

    it('should round-trip a token without intent', async () => {
      const token = await signSlackLinkToken(validParams);
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.intent).toBeUndefined();
    });

    it('should preserve all intent fields through sign/verify', async () => {
      const runIntent: SlackLinkIntent = {
        entryPoint: 'run_command',
        question: 'How do I deploy?',
        channelId: 'C99999999',
        responseUrl: 'https://hooks.slack.com/commands/T123/456/abc',
        agentIdentifier: 'deploy-agent',
      };

      const token = await signSlackLinkToken({
        ...validParams,
        intent: runIntent,
      });
      const result = await verifySlackLinkToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.intent?.entryPoint).toBe('run_command');
      expect(result.payload?.intent?.question).toBe('How do I deploy?');
      expect(result.payload?.intent?.channelId).toBe('C99999999');
      expect(result.payload?.intent?.responseUrl).toBe(
        'https://hooks.slack.com/commands/T123/456/abc'
      );
      expect(result.payload?.intent?.agentIdentifier).toBe('deploy-agent');
    });
  });
});

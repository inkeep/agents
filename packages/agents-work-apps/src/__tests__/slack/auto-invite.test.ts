/**
 * Tests for the auto-invite flow in handleLinkCommand
 *
 * Exercises the tryAutoInvite logic through handleLinkCommand:
 * - shouldAllowJoinFromWorkspace disabled → falls through to JWT link flow
 * - User already has Inkeep account → falls through to JWT link flow
 * - No email in Slack profile → falls through to JWT link flow
 * - Existing pending invitation → reuses it
 * - New invitation created → directs to accept-invitation page
 * - Errors caught gracefully → falls through to JWT link flow
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindWorkAppSlackWorkspaceByTeamId,
  mockFindWorkAppSlackUserMapping,
  mockGetOrganizationMemberByEmail,
  mockGetPendingInvitationsByEmail,
  mockCreateInvitationInDb,
  mockSignSlackLinkToken,
  mockSlackUsersInfo,
} = vi.hoisted(() => ({
  mockFindWorkAppSlackWorkspaceByTeamId: vi.fn(),
  mockFindWorkAppSlackUserMapping: vi.fn(),
  mockGetOrganizationMemberByEmail: vi.fn(),
  mockGetPendingInvitationsByEmail: vi.fn(),
  mockCreateInvitationInDb: vi.fn(),
  mockSignSlackLinkToken: vi.fn(),
  mockSlackUsersInfo: vi.fn(),
}));

vi.mock('@inkeep/agents-core', () => ({
  findWorkAppSlackWorkspaceByTeamId: () => mockFindWorkAppSlackWorkspaceByTeamId,
  findWorkAppSlackUserMapping: () => mockFindWorkAppSlackUserMapping,
  getOrganizationMemberByEmail: () => mockGetOrganizationMemberByEmail,
  getPendingInvitationsByEmail: () => mockGetPendingInvitationsByEmail,
  createInvitationInDb: () => mockCreateInvitationInDb,
  signSlackLinkToken: mockSignSlackLinkToken,
}));

vi.mock('../../db/runDbClient', () => ({ default: {} }));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    users: { info: mockSlackUsersInfo },
  })),
}));

vi.mock('../../slack/services/blocks', () => ({
  createAlreadyLinkedMessage: vi.fn(() => ({ blocks: [{ type: 'section' }] })),
  createJwtLinkMessage: vi.fn(() => ({ blocks: [{ type: 'section', text: 'jwt-link' }] })),
  createCreateInkeepAccountMessage: vi.fn((url: string) => ({
    blocks: [{ type: 'section', text: `create-account:${url}` }],
  })),
  createErrorMessage: vi.fn((msg: string) => ({ blocks: [{ type: 'section', text: msg }] })),
}));

import { handleLinkCommand } from '../../slack/services/commands';
import type { SlackCommandPayload } from '../../slack/services/types';

const basePayload: SlackCommandPayload = {
  command: '/inkeep',
  text: 'link',
  userId: 'U_SLACK_123',
  userName: 'testuser',
  teamId: 'T_TEAM_789',
  teamDomain: 'test-workspace',
  channelId: 'C456',
  channelName: 'general',
  responseUrl: 'https://hooks.slack.com/commands/T789/123/abc',
  triggerId: '123.456.abc',
};

const TENANT_ID = 'org_test_tenant';
const BOT_TOKEN = 'xoxb-test-bot-token';
const DASHBOARD_URL = 'http://localhost:3000/org_test_tenant/work-apps/slack';

describe('auto-invite flow in handleLinkCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindWorkAppSlackUserMapping.mockResolvedValue(null);
    mockSignSlackLinkToken.mockResolvedValue('mock-link-token');
  });

  it('should fall through to JWT link flow when shouldAllowJoinFromWorkspace is disabled', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue({
      shouldAllowJoinFromWorkspace: false,
    });

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    expect(mockGetOrganizationMemberByEmail).not.toHaveBeenCalled();
    expect(mockCreateInvitationInDb).not.toHaveBeenCalled();

    const { createJwtLinkMessage } = await import('../../slack/services/blocks');
    expect(createJwtLinkMessage).toHaveBeenCalled();
  });

  it('should fall through to JWT link flow when workspace is null', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue(null);

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    const { createJwtLinkMessage } = await import('../../slack/services/blocks');
    expect(createJwtLinkMessage).toHaveBeenCalled();
  });

  it('should fall through to JWT link flow when no bot token provided', async () => {
    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, undefined);

    expect(result.response_type).toBe('ephemeral');
    expect(mockFindWorkAppSlackWorkspaceByTeamId).not.toHaveBeenCalled();

    const { createJwtLinkMessage } = await import('../../slack/services/blocks');
    expect(createJwtLinkMessage).toHaveBeenCalled();
  });

  it('should fall through to JWT link flow when Slack user has no email', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue({
      shouldAllowJoinFromWorkspace: true,
    });
    mockSlackUsersInfo.mockResolvedValue({ user: { profile: {} } });

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    expect(mockGetOrganizationMemberByEmail).not.toHaveBeenCalled();

    const { createJwtLinkMessage } = await import('../../slack/services/blocks');
    expect(createJwtLinkMessage).toHaveBeenCalled();
  });

  it('should fall through to JWT link flow when user already has Inkeep account', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue({
      shouldAllowJoinFromWorkspace: true,
    });
    mockSlackUsersInfo.mockResolvedValue({
      user: { profile: { email: 'existing@example.com' } },
    });
    mockGetOrganizationMemberByEmail.mockResolvedValue({
      id: 'user_existing',
      email: 'existing@example.com',
    });

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    expect(mockCreateInvitationInDb).not.toHaveBeenCalled();

    const { createJwtLinkMessage } = await import('../../slack/services/blocks');
    expect(createJwtLinkMessage).toHaveBeenCalled();
  });

  it('should reuse existing pending invitation instead of creating a new one', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue({
      shouldAllowJoinFromWorkspace: true,
    });
    mockSlackUsersInfo.mockResolvedValue({
      user: { profile: { email: 'new@example.com' } },
    });
    mockGetOrganizationMemberByEmail.mockResolvedValue(null);
    mockGetPendingInvitationsByEmail.mockResolvedValue([
      { id: 'inv_existing_123', organizationId: TENANT_ID, email: 'new@example.com' },
    ]);

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    expect(mockCreateInvitationInDb).not.toHaveBeenCalled();

    const { createCreateInkeepAccountMessage } = await import('../../slack/services/blocks');
    expect(createCreateInkeepAccountMessage).toHaveBeenCalledWith(
      expect.stringContaining('/accept-invitation/inv_existing_123'),
      expect.any(Number)
    );
  });

  it('should create new invitation when no existing pending invitation', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue({
      shouldAllowJoinFromWorkspace: true,
    });
    mockSlackUsersInfo.mockResolvedValue({
      user: { profile: { email: 'brand-new@example.com' } },
    });
    mockGetOrganizationMemberByEmail.mockResolvedValue(null);
    mockGetPendingInvitationsByEmail.mockResolvedValue([]);
    mockCreateInvitationInDb.mockResolvedValue({ id: 'inv_new_456' });

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    expect(mockCreateInvitationInDb).toHaveBeenCalledWith({
      organizationId: TENANT_ID,
      email: 'brand-new@example.com',
    });

    const { createCreateInkeepAccountMessage } = await import('../../slack/services/blocks');
    expect(createCreateInkeepAccountMessage).toHaveBeenCalledWith(
      expect.stringContaining('/accept-invitation/inv_new_456'),
      expect.any(Number)
    );
  });

  it('should include returnUrl with link token in the accept-invitation URL', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue({
      shouldAllowJoinFromWorkspace: true,
    });
    mockSlackUsersInfo.mockResolvedValue({
      user: { profile: { email: 'new@example.com' } },
    });
    mockGetOrganizationMemberByEmail.mockResolvedValue(null);
    mockGetPendingInvitationsByEmail.mockResolvedValue([]);
    mockCreateInvitationInDb.mockResolvedValue({ id: 'inv_789' });
    mockSignSlackLinkToken.mockResolvedValue('jwt-token-for-linking');

    await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    const { createCreateInkeepAccountMessage } = await import('../../slack/services/blocks');
    const callArgs = vi.mocked(createCreateInkeepAccountMessage).mock.calls[0];
    const url = callArgs[0];

    expect(url).toContain('/accept-invitation/inv_789');
    expect(url).toContain('email=new%40example.com');
    expect(url).toContain('returnUrl=');
    expect(url).toContain('token%3Djwt-token-for-linking');
  });

  it('should fall through to JWT link flow when tryAutoInvite throws', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockRejectedValue(new Error('DB connection failed'));

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');

    const { createJwtLinkMessage } = await import('../../slack/services/blocks');
    expect(createJwtLinkMessage).toHaveBeenCalled();
  });

  it('should return already-linked message when user is already linked', async () => {
    mockFindWorkAppSlackUserMapping.mockResolvedValue({
      id: 'wsum_existing',
      slackUserId: 'U_SLACK_123',
      slackTeamId: 'T_TEAM_789',
      inkeepUserId: 'user_123',
      slackEmail: 'test@example.com',
      linkedAt: '2025-01-01T00:00:00Z',
    });

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    expect(mockFindWorkAppSlackWorkspaceByTeamId).not.toHaveBeenCalled();

    const { createAlreadyLinkedMessage } = await import('../../slack/services/blocks');
    expect(createAlreadyLinkedMessage).toHaveBeenCalled();
  });

  it('should not reuse pending invitation from a different organization', async () => {
    mockFindWorkAppSlackWorkspaceByTeamId.mockResolvedValue({
      shouldAllowJoinFromWorkspace: true,
    });
    mockSlackUsersInfo.mockResolvedValue({
      user: { profile: { email: 'new@example.com' } },
    });
    mockGetOrganizationMemberByEmail.mockResolvedValue(null);
    mockGetPendingInvitationsByEmail.mockResolvedValue([
      { id: 'inv_other_org', organizationId: 'org_different', email: 'new@example.com' },
    ]);
    mockCreateInvitationInDb.mockResolvedValue({ id: 'inv_correct_org' });

    const result = await handleLinkCommand(basePayload, DASHBOARD_URL, TENANT_ID, BOT_TOKEN);

    expect(result.response_type).toBe('ephemeral');
    expect(mockCreateInvitationInDb).toHaveBeenCalledWith({
      organizationId: TENANT_ID,
      email: 'new@example.com',
    });

    const { createCreateInkeepAccountMessage } = await import('../../slack/services/blocks');
    expect(createCreateInkeepAccountMessage).toHaveBeenCalledWith(
      expect.stringContaining('/accept-invitation/inv_correct_org'),
      expect.any(Number)
    );
  });
});

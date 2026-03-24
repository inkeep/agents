/**
 * Tests for handleCommand — the slash command dispatcher
 *
 * Tests critical paths:
 * - Routing: each subcommand dispatches correctly
 * - Empty text opens agent picker (returns {})
 * - Help returns ephemeral response
 * - Unknown text treated as question
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', () => ({
  deleteWorkAppSlackUserMapping: () => vi.fn().mockResolvedValue(true),
  findWorkAppSlackUserMapping: () => vi.fn().mockResolvedValue(null),
  findWorkAppSlackUserMappingBySlackUser: () => vi.fn().mockResolvedValue(null),
  flushTraces: vi.fn().mockReturnValue(Promise.resolve()),
  getTracer: vi.fn(() => ({
    startActiveSpan: vi.fn((_name: string, fn: (span: unknown) => unknown) =>
      fn({ setAttribute: vi.fn(), end: vi.fn() })
    ),
  })),
  getWaitUntil: vi.fn().mockResolvedValue(null),
  signSlackLinkToken: vi.fn().mockResolvedValue('mock-link-token'),
  signSlackUserToken: vi.fn().mockResolvedValue('mock-jwt-token'),
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
  findWorkspaceConnectionByTeamId: vi.fn().mockResolvedValue({
    connectionId: 'conn-1',
    teamId: 'T789',
    botToken: 'xoxb-123',
    tenantId: 'default',
  }),
}));

vi.mock('../../slack/services/client', () => ({
  getSlackClient: vi.fn(() => ({
    views: { open: vi.fn().mockResolvedValue({ ok: true }) },
    chat: {
      postEphemeral: vi.fn().mockResolvedValue({ ok: true }),
      postMessage: vi.fn().mockResolvedValue({ ok: true }),
    },
  })),
}));

vi.mock('../../slack/services/events/execution', () => ({
  executeAgentPublicly: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../slack/services/events/utils', () => ({
  fetchProjectsForTenant: vi.fn().mockResolvedValue([{ id: 'proj-1', name: 'Project' }]),
  fetchAgentsForProject: vi
    .fn()
    .mockResolvedValue([
      { id: 'agent-1', name: 'Agent', projectId: 'proj-1', projectName: 'Project' },
    ]),
  generateSlackConversationId: vi.fn().mockReturnValue('slack-trigger-T789-123.456000-agent-1'),
  getChannelAgentConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../slack/services/blocks', () => ({
  createContextBlockFromText: vi.fn((msg: string) => ({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: msg }],
  })),
  createErrorMessage: vi.fn((msg: string) => ({
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: msg } }],
  })),
  createUpdatedHelpMessage: vi.fn(() => ({ blocks: [] })),
  createAlreadyLinkedMessage: vi.fn(() => ({ blocks: [] })),
  createNotLinkedMessage: vi.fn(() => ({ blocks: [] })),
  createUnlinkSuccessMessage: vi.fn(() => ({ blocks: [] })),
  createStatusMessage: vi.fn(() => ({ blocks: [] })),
  createSmartLinkMessage: vi.fn(() => ({ blocks: [] })),
  createContextBlock: vi.fn(() => ({ type: 'context', elements: [] })),
}));

vi.mock('../../slack/services/link-prompt', () => ({
  resolveUnlinkedUserAction: vi.fn().mockResolvedValue({
    type: 'jwt_link',
    url: 'http://localhost:3000/link?token=test',
    expiresInMinutes: 10,
  }),
  buildLinkPromptMessage: vi.fn().mockReturnValue({ text: 'Link account', blocks: [] }),
}));

vi.mock('../../slack/services/modals', () => ({
  buildAgentSelectorModal: vi.fn(() => ({ type: 'modal', blocks: [] })),
}));

vi.mock('../../slack/services/agent-resolution', () => ({
  resolveEffectiveAgent: vi.fn().mockResolvedValue(null),
  getAgentConfigSources: vi.fn().mockResolvedValue({
    channelConfig: null,
    workspaceConfig: null,
    effective: null,
  }),
}));

import { handleCommand } from '../../slack/services/commands';
import type { SlackCommandPayload } from '../../slack/services/types';

const basePayload: SlackCommandPayload = {
  command: '/inkeep',
  text: '',
  userId: 'U123',
  userName: 'testuser',
  teamId: 'T789',
  teamDomain: 'test',
  channelId: 'C456',
  channelName: 'general',
  responseUrl: 'https://hooks.slack.com/commands/T789/123/abc',
  triggerId: '123.456.abc',
};

describe('handleCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return help message for "help" command', async () => {
    const result = await handleCommand({ ...basePayload, text: 'help' });
    expect(result.response_type).toBe('ephemeral');
  });

  it('should return empty object for empty text (agent picker)', async () => {
    const result = await handleCommand({ ...basePayload, text: '' });
    // Empty object triggers modal open, route returns null body
    expect(result).toEqual({});
  });

  it('should route "link" command', async () => {
    const result = await handleCommand({ ...basePayload, text: 'link' });
    expect(result.response_type).toBe('ephemeral');
  });

  it('should route "connect" as alias for link', async () => {
    const result = await handleCommand({ ...basePayload, text: 'connect' });
    expect(result.response_type).toBe('ephemeral');
  });

  it('should route "status" command', async () => {
    const result = await handleCommand({ ...basePayload, text: 'status' });
    expect(result.response_type).toBe('ephemeral');
  });

  it('should route "unlink" command', async () => {
    const result = await handleCommand({ ...basePayload, text: 'unlink' });
    expect(result.response_type).toBe('ephemeral');
  });

  it('should treat unknown text as a question command', async () => {
    const result = await handleCommand({ ...basePayload, text: 'What is Inkeep?' });
    expect(result.response_type).toBe('ephemeral');
  });

  it('should handle case-insensitive subcommands', async () => {
    const result = await handleCommand({ ...basePayload, text: 'HELP' });
    expect(result.response_type).toBe('ephemeral');
  });
});

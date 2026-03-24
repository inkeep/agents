import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', () => ({
  flushTraces: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../slack/tracer', () => {
  const mockSpan = {
    setAttribute: vi.fn(),
    updateName: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  return {
    tracer: {
      startActiveSpan: vi.fn((_name: string, fn: (span: typeof mockSpan) => unknown) =>
        fn(mockSpan)
      ),
    },
    SLACK_SPAN_NAMES: { WEBHOOK: 'slack.webhook' },
    SLACK_SPAN_KEYS: {
      EVENT_TYPE: 'slack.event_type',
      OUTCOME: 'slack.outcome',
      TEAM_ID: 'slack.team_id',
    },
  };
});

vi.mock('../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

const mockDispatchSlackEvent = vi.fn().mockResolvedValue({ outcome: 'handled' });
vi.mock('../../slack/dispatcher', () => ({
  dispatchSlackEvent: (...args: unknown[]) => mockDispatchSlackEvent(...args),
}));

const mockHandleCommand = vi.fn().mockResolvedValue({ text: 'response' });
vi.mock('../../slack/services', () => ({
  handleCommand: (...args: unknown[]) => mockHandleCommand(...args),
  findWorkspaceConnectionByTeamId: vi.fn(),
  getSlackClient: vi.fn(),
}));

vi.mock('../../slack/services/nango', () => ({
  findWorkspaceConnectionByTeamId: vi.fn(),
}));

vi.mock('../../slack/services/events', () => ({
  handleAppMention: vi.fn().mockResolvedValue(undefined),
  handleMessageShortcut: vi.fn().mockResolvedValue(undefined),
  handleModalSubmission: vi.fn().mockResolvedValue(undefined),
  handleOpenAgentSelectorModal: vi.fn().mockResolvedValue(undefined),
  sendResponseUrlMessage: vi.fn().mockResolvedValue(undefined),
}));

const mockSocketModeStart = vi.fn().mockResolvedValue(undefined);
let registeredListeners: Record<string, ((...args: unknown[]) => void)[]>;

vi.mock('@slack/socket-mode', () => ({
  SocketModeClient: vi.fn().mockImplementation(() => ({
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (!registeredListeners[event]) {
        registeredListeners[event] = [];
      }
      registeredListeners[event].push(listener);
    },
    start: mockSocketModeStart,
  })),
}));

describe('startSocketMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredListeners = {};
    delete (globalThis as Record<string, unknown>).__inkeep_slack_socket_mode_client__;
  });

  it('should start the Socket Mode client and register listeners', async () => {
    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    expect(mockSocketModeStart).toHaveBeenCalledTimes(1);
    expect(registeredListeners.slack_event).toHaveLength(1);
    expect(registeredListeners.interactive).toHaveLength(1);
    expect(registeredListeners.slash_commands).toHaveLength(1);
    expect(registeredListeners.error).toHaveLength(1);
    expect(registeredListeners.disconnected).toHaveLength(1);
    expect(registeredListeners.reconnecting).toHaveLength(1);
  });

  it('should store client in globalThis only after successful start', async () => {
    const { startSocketMode } = await import('../../slack/socket-mode');
    const key = '__inkeep_slack_socket_mode_client__';

    mockSocketModeStart.mockImplementationOnce(() => {
      expect((globalThis as Record<string, unknown>)[key]).toBeUndefined();
      return Promise.resolve();
    });

    await startSocketMode('xapp-test-token');
    expect((globalThis as Record<string, unknown>)[key]).toBeDefined();
  });

  it('should skip if client already exists (HMR safety)', async () => {
    (globalThis as Record<string, unknown>).__inkeep_slack_socket_mode_client__ = {};
    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    expect(mockSocketModeStart).not.toHaveBeenCalled();
  });

  it('should dispatch events_api events through dispatchSlackEvent', async () => {
    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn().mockResolvedValue(undefined);
    const listener = registeredListeners.slack_event[0];
    await listener({
      ack,
      body: { event: { type: 'app_mention' }, team_id: 'T123' },
      type: 'events_api',
    });

    expect(ack).toHaveBeenCalledTimes(1);
    expect(mockDispatchSlackEvent).toHaveBeenCalledWith(
      'event_callback',
      expect.any(Object),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('should ignore non-events_api slack events', async () => {
    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn();
    const listener = registeredListeners.slack_event[0];
    await listener({ ack, body: {}, type: 'hello' });

    expect(ack).not.toHaveBeenCalled();
    expect(mockDispatchSlackEvent).not.toHaveBeenCalled();
  });

  it('should handle interactive events and pass response to ack', async () => {
    const mockResponse = { response_action: 'errors', errors: {} };
    mockDispatchSlackEvent.mockResolvedValueOnce({
      outcome: 'validation_error',
      response: mockResponse,
    });

    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn().mockResolvedValue(undefined);
    const listener = registeredListeners.interactive[0];
    await listener({
      ack,
      body: { type: 'view_submission', view: { callback_id: 'test' } },
    });

    expect(ack).toHaveBeenCalledWith(mockResponse);
  });

  it('should handle slash commands and call handleCommand', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn().mockResolvedValue(undefined);
    const listener = registeredListeners.slash_commands[0];
    await listener({
      ack,
      body: {
        command: '/inkeep',
        text: 'hello',
        user_id: 'U123',
        user_name: 'testuser',
        team_id: 'T123',
        team_domain: 'test',
        channel_id: 'C123',
        channel_name: 'general',
        response_url: 'https://hooks.slack.com/commands/123',
        trigger_id: 'trig123',
      },
    });

    expect(ack).toHaveBeenCalledWith();
    expect(mockHandleCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: '/inkeep',
        text: 'hello',
        userId: 'U123',
        teamId: 'T123',
      })
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.slack.com/commands/123',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'response' }),
      })
    );

    fetchSpy.mockRestore();
  });

  it('should not post to response_url for empty command response', async () => {
    mockHandleCommand.mockResolvedValueOnce({});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn().mockResolvedValue(undefined);
    const listener = registeredListeners.slash_commands[0];
    await listener({
      ack,
      body: { command: '/inkeep', text: '', response_url: 'https://hooks.slack.com/commands/123' },
    });

    expect(ack).toHaveBeenCalledWith();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('should handle dispatchSlackEvent errors in slack_event listener', async () => {
    mockDispatchSlackEvent.mockRejectedValueOnce(new Error('dispatch failed'));

    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn().mockResolvedValue(undefined);
    const listener = registeredListeners.slack_event[0];
    await listener({
      ack,
      body: { event: { type: 'app_mention' }, team_id: 'T123' },
      type: 'events_api',
    });

    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('should handle dispatchSlackEvent errors in interactive listener', async () => {
    mockDispatchSlackEvent.mockRejectedValueOnce(new Error('dispatch failed'));

    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn().mockResolvedValue(undefined);
    const listener = registeredListeners.interactive[0];
    await listener({
      ack,
      body: { type: 'view_submission', view: { callback_id: 'test' } },
    });

    expect(ack).toHaveBeenCalledWith(undefined);
  });

  it('should handle handleCommand errors in slash_commands listener', async () => {
    mockHandleCommand.mockRejectedValueOnce(new Error('command failed'));

    const { startSocketMode } = await import('../../slack/socket-mode');
    await startSocketMode('xapp-test-token');

    const ack = vi.fn().mockResolvedValue(undefined);
    const listener = registeredListeners.slash_commands[0];
    await listener({
      ack,
      body: { command: '/inkeep', text: 'hello', team_id: 'T123' },
    });

    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith();
  });
});

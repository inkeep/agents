/**
 * Regression test for PRD-6187: Agent Card 400 error
 *
 * Verifies the agent card endpoint never returns a 400 through the full
 * middleware stack, regardless of header combinations.
 */
import { describe, expect, it } from 'vitest';
import { makeRunRequest, makeRunRequestWithContext } from '../../utils/testRequest';

describe('PRD-6187: Agent Card must not return 400', () => {
  it('returns non-400 through the full middleware stack', async () => {
    const response = await makeRunRequest('/run/agents/.well-known/agent.json', {
      method: 'GET',
    });

    expect(response.status).not.toBe(400);
  });

  it('returns non-400 with copilot-like headers', async () => {
    const response = await makeRunRequestWithContext(
      '/run/agents/.well-known/agent.json',
      {
        tenantId: 'test-tenant',
        projectId: 'default',
        agentId: 'test-agent',
        subAgentId: 'test-sub-agent',
      },
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-forwarded-cookie': 'session=test-cookie',
        },
      }
    );

    expect(response.status).not.toBe(400);
  });

  it('returns non-400 with extra forwarded headers', async () => {
    const response = await makeRunRequestWithContext(
      '/run/agents/.well-known/agent.json',
      {
        tenantId: 'test-tenant',
        projectId: 'default',
        agentId: 'test-agent',
        subAgentId: 'test-sub-agent',
      },
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-forwarded-cookie': 'session=test-cookie',
          'x-inkeep-client-timezone': 'America/New_York',
          'x-inkeep-client-timestamp': '2026-02-26T19:45:30.123Z',
        },
      }
    );

    expect(response.status).not.toBe(400);
  });

  it('returns non-400 with minimal headers (no sub-agent)', async () => {
    const response = await makeRunRequestWithContext(
      '/run/agents/.well-known/agent.json',
      {
        tenantId: 'test-tenant',
        projectId: 'default',
        agentId: 'test-agent',
      },
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }
    );

    expect(response.status).not.toBe(400);
  });
});

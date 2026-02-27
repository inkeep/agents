/**
 * Reproduction test for PRD-6187: Agent Card 400 error
 *
 * Tests the agent card endpoint through the full middleware stack
 * to identify what produces the 400 response.
 */
import { describe, it, expect } from 'vitest';
import { makeRunRequest, makeRunRequestWithContext } from '../../utils/testRequest';

describe('PRD-6187: Agent Card 400 reproduction (full middleware stack)', () => {
  it('should return a valid response when fetching agent card through full app', async () => {
    const response = await makeRunRequest('/run/agents/.well-known/agent.json', {
      method: 'GET',
    });

    const body = await response.text();
    console.log('Full app test - status:', response.status);
    console.log('Full app test - body:', body);

    // The agent card endpoint should NOT return 400
    // It may return 404 if the test agent isn't registered, but NEVER 400
    expect(response.status).not.toBe(400);
  });

  it('should not return 400 with copilot-like headers', async () => {
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

    const body = await response.text();
    console.log('Copilot-like headers test - status:', response.status);
    console.log('Copilot-like headers test - body:', body);

    expect(response.status).not.toBe(400);
  });

  it('should not return 400 with extra forwarded headers', async () => {
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

    const body = await response.text();
    console.log('Extra headers test - status:', response.status);
    console.log('Extra headers test - body:', body);

    expect(response.status).not.toBe(400);
  });

  it('should not return 400 with minimal headers (no sub-agent)', async () => {
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

    const body = await response.text();
    console.log('Minimal headers test - status:', response.status);
    console.log('Minimal headers test - body:', body);

    expect(response.status).not.toBe(400);
  });
});

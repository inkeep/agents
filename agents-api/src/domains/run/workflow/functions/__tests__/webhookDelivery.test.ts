import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('workflow', () => ({
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: 'wf-run-123' })),
  sleep: vi.fn(),
}));

vi.mock('../../steps/webhookDeliverySteps', () => ({
  deliverWebhookStep: vi.fn(),
  logStep: vi.fn(),
}));

import { sleep } from 'workflow';
import { deliverWebhookStep } from '../../steps/webhookDeliverySteps';
import type { WebhookDeliveryPayload } from '../webhookDelivery';

const mockDeliverStep = deliverWebhookStep as ReturnType<typeof vi.fn>;
const mockSleep = sleep as ReturnType<typeof vi.fn>;

const basePayload: WebhookDeliveryPayload = {
  destinationUrl: 'https://hook.example.com',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  agentId: 'agent-1',
  webhookDestinationId: 'dest-1',
  payload: { type: 'conversation.created', data: { conversationId: 'conv-1' } },
};

async function runWorkflow(payload: WebhookDeliveryPayload) {
  const { webhookDeliveryWorkflow } = await import('../webhookDelivery');
  return webhookDeliveryWorkflow(payload);
}

describe('webhookDeliveryWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns delivered on first attempt success', async () => {
    mockDeliverStep.mockResolvedValueOnce({ success: true, statusCode: 200 });

    const result = await runWorkflow(basePayload);

    expect(result).toEqual({ status: 'delivered', attempt: 1, statusCode: 200 });
    expect(mockDeliverStep).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('retries on 5xx and succeeds on attempt 2', async () => {
    mockDeliverStep
      .mockResolvedValueOnce({ success: false, statusCode: 502, error: 'HTTP 502' })
      .mockResolvedValueOnce({ success: true, statusCode: 200 });

    const result = await runWorkflow(basePayload);

    expect(result).toEqual({ status: 'delivered', attempt: 2, statusCode: 200 });
    expect(mockDeliverStep).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenCalledTimes(1);
  });

  it('fails immediately on non-retryable 403', async () => {
    mockDeliverStep.mockResolvedValueOnce({ success: false, statusCode: 403, error: 'HTTP 403' });

    const result = await runWorkflow(basePayload);

    expect(result).toEqual({ status: 'failed', attempt: 1, statusCode: 403, error: 'HTTP 403' });
    expect(mockDeliverStep).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('fails immediately when step reports blocked: true (SSRF short-circuit)', async () => {
    mockDeliverStep.mockResolvedValueOnce({
      success: false,
      blocked: true,
      error: 'Destination URL blocked',
    });

    const result = await runWorkflow(basePayload);

    expect(result).toEqual({ status: 'failed', attempt: 1, error: 'Destination URL blocked' });
    expect(mockDeliverStep).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('retries on 429 and exhausts all attempts', async () => {
    mockDeliverStep.mockResolvedValue({ success: false, statusCode: 429, error: 'HTTP 429' });

    const result = await runWorkflow(basePayload);

    expect(result).toEqual({ status: 'failed', attempt: 3, error: 'HTTP 429' });
    expect(mockDeliverStep).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  it('retries on 408 and exhausts all attempts', async () => {
    mockDeliverStep.mockResolvedValue({ success: false, statusCode: 408, error: 'HTTP 408' });

    const result = await runWorkflow(basePayload);

    expect(result).toEqual({ status: 'failed', attempt: 3, error: 'HTTP 408' });
    expect(mockDeliverStep).toHaveBeenCalledTimes(3);
  });

  it('exhausts all retries on repeated network errors', async () => {
    mockDeliverStep.mockResolvedValue({
      success: false,
      error: 'Network error delivering webhook',
    });

    const result = await runWorkflow(basePayload);

    expect(result).toEqual({
      status: 'failed',
      attempt: 3,
      error: 'Network error delivering webhook',
    });
    expect(mockDeliverStep).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  it('applies exponential backoff between retries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockDeliverStep.mockResolvedValue({ success: false, statusCode: 500, error: 'HTTP 500' });

    await runWorkflow(basePayload);

    expect(mockSleep).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenNthCalledWith(1, 2_000);
    expect(mockSleep).toHaveBeenNthCalledWith(2, 4_000);

    vi.spyOn(Math, 'random').mockRestore();
  });

  it('does not sleep after the final attempt', async () => {
    mockDeliverStep.mockResolvedValue({ success: false, statusCode: 500, error: 'HTTP 500' });

    await runWorkflow(basePayload);

    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  it('passes correct params to deliverWebhookStep', async () => {
    mockDeliverStep.mockResolvedValueOnce({ success: true, statusCode: 200 });

    await runWorkflow(basePayload);

    expect(mockDeliverStep).toHaveBeenCalledWith({
      destinationUrl: 'https://hook.example.com',
      payload: basePayload.payload,
    });
  });
});

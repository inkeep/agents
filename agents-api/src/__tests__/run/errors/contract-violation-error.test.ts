import { describe, expect, it } from 'vitest';
import { ContractViolationError } from '../../../domains/run/errors/contract-violation-error';

describe('ContractViolationError', () => {
  it('is an Error and carries the structured fields', () => {
    const err = new ContractViolationError({
      subAgentId: 'query-agent',
      policy: 'reject',
      attemptedRetries: 0,
      lastResponseText: 'some prose',
      reason: 'requireComponent — the response must include data component(s) [X]',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ContractViolationError');
    expect(err.subAgentId).toBe('query-agent');
    expect(err.policy).toBe('reject');
    expect(err.attemptedRetries).toBe(0);
    expect(err.lastResponseText).toBe('some prose');
    expect(err.reason).toContain('requireComponent');
  });

  it('includes the sub-agent id, policy, and reason in the message', () => {
    const err = new ContractViolationError({
      subAgentId: 'select-agent',
      policy: 'retry',
      attemptedRetries: 1,
      lastResponseText: '',
      reason: 'requireTransfer — no transfer occurred',
    });

    expect(err.message).toContain('select-agent');
    expect(err.message).toContain('retry');
    expect(err.message).toContain('requireTransfer');
  });
});

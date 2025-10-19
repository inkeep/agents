import { beforeEach, describe, expect, it } from 'vitest';
import { transfer } from '../../builders';
import { SubAgent } from '../../subAgent';

describe('transfer builder function', () => {
  let targetAgent: SubAgent;

  beforeEach(() => {
    targetAgent = new SubAgent({
      id: 'target-agent',
      name: 'Target Agent',
      description: 'Agent that receives transfers',
      prompt: 'Handle transferred tasks',
    });
  });

  it('should create a transfer with basic config', () => {
    const transferConfig = transfer(targetAgent, 'Transfer to support agent');

    expect(transferConfig.agent).toBe(targetAgent);
    expect(transferConfig.description).toBe('Transfer to support agent');
    expect(transferConfig.condition).toBeUndefined();
  });

  it('should create a transfer without description', () => {
    const transferConfig = transfer(targetAgent);

    expect(transferConfig.agent).toBe(targetAgent);
    expect(transferConfig.description).toBe('Hand off to Target Agent');
    expect(transferConfig.condition).toBeUndefined();
  });

  it('should create a transfer with condition function', () => {
    const condition = (context: any) => context.complexity > 0.8;
    const transferConfig = transfer(targetAgent, 'Transfer for complex issues', condition);

    expect(transferConfig.agent).toBe(targetAgent);
    expect(transferConfig.description).toBe('Transfer for complex issues');
    expect(transferConfig.condition).toBe(condition);
  });

  it('should validate condition function', () => {
    const notAFunction = 'not a function' as any;

    expect(() => transfer(targetAgent, 'Invalid transfer', notAFunction)).toThrow(
      'condition must be a function'
    );
  });

  it('should work with condition function that returns boolean', () => {
    const alwaysTransfer = () => true;
    const neverTransfer = () => false;

    const alwaysConfig = transfer(targetAgent, 'Always transfer', alwaysTransfer);
    const neverConfig = transfer(targetAgent, 'Never transfer', neverTransfer);

    expect(alwaysConfig.condition?.({})).toBe(true);
    expect(neverConfig.condition?.({})).toBe(false);
  });

  it('should handle context-based conditions', () => {
    const contextCondition = (context: any) => {
      return context.user?.role === 'premium' && context.issue?.priority === 'high';
    };

    const transferConfig = transfer(
      targetAgent,
      'Transfer premium high priority',
      contextCondition
    );

    // Test with matching context
    expect(
      transferConfig.condition?.({
        user: { role: 'premium' },
        issue: { priority: 'high' },
      })
    ).toBe(true);

    // Test with non-matching context
    expect(
      transferConfig.condition?.({
        user: { role: 'free' },
        issue: { priority: 'low' },
      })
    ).toBe(false);
  });

  it('should generate default description based on agent name', () => {
    const customAgent = new SubAgent({
      id: 'custom-agent',
      name: 'Custom Support Agent',
      description: 'Custom agent',
      prompt: 'Custom prompt',
    });

    const transferConfig = transfer(customAgent);

    expect(transferConfig.description).toBe('Hand off to Custom Support Agent');
  });
});
